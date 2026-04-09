package main

import (
	"encoding/gob"
	"encoding/hex"
	"flag"
	"fmt"
	"image"
	"image/color"
	"image/draw"
	"image/gif"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"log"
	"net/rpc"
	"os"
	"os/exec"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/disintegration/imaging"
)

const displayW, displayH = 128, 32

func init() {
	// Must match the server's gob registration so interface values encode correctly.
	gob.Register(color.RGBA{})
}

// RPC arg/reply types must match the server's registered handler exactly.
type geometryArgs struct{}
type geometryReply struct{ Width, Height int }
type applyArgs struct{ Colors []color.Color }
type applyReply struct{}

type display struct {
	client        *rpc.Client
	width, height int
}

func connect(addr string) (*display, error) {
	client, err := rpc.DialHTTP("tcp", addr)
	if err != nil {
		return nil, err
	}
	var reply geometryReply
	if err := client.Call("RPCMatrix.Geometry", &geometryArgs{}, &reply); err != nil {
		client.Close()
		return nil, fmt.Errorf("geometry: %v", err)
	}
	return &display{client: client, width: reply.Width, height: reply.Height}, nil
}

func (d *display) apply(pixels []color.Color) error {
	var reply applyReply
	return d.client.Call("RPCMatrix.Apply", &applyArgs{Colors: pixels}, &reply)
}

// fromImage scales img to fit the display (letterboxed) and returns a pixel slice.
func (d *display) fromImage(img image.Image) []color.Color {
	scaled := imaging.Fit(img, d.width, d.height, imaging.Lanczos)
	canvas := imaging.New(d.width, d.height, color.Black)
	ox := (d.width - scaled.Bounds().Dx()) / 2
	oy := (d.height - scaled.Bounds().Dy()) / 2
	fitted := imaging.Paste(canvas, scaled, image.Pt(ox, oy))

	p := make([]color.Color, d.width*d.height)
	for y := 0; y < d.height; y++ {
		for x := 0; x < d.width; x++ {
			r, g, b, a := fitted.At(x, y).RGBA()
			p[y*d.width+x] = color.RGBA{R: uint8(r >> 8), G: uint8(g >> 8), B: uint8(b >> 8), A: uint8(a >> 8)}
		}
	}
	return p
}

var addr = flag.String("addr", "100.123.178.9:1234", "marquee RPC server address")

func main() {
	flag.Parse()
	if flag.NArg() == 0 {
		fmt.Fprintln(os.Stderr, "usage: marquee-client [--addr host:port] <fill|image|gif|webcam> [args]")
		os.Exit(1)
	}

	d, err := connect(*addr)
	if err != nil {
		log.Fatalf("connect: %v", err)
	}

	switch flag.Arg(0) {
	case "fill":
		if flag.NArg() < 2 {
			log.Fatal("usage: fill <RRGGBB>")
		}
		doFill(d, flag.Arg(1))
	case "image":
		if flag.NArg() < 2 {
			log.Fatal("usage: image <path>")
		}
		doImage(d, flag.Arg(1))
	case "gif":
		if flag.NArg() < 2 {
			log.Fatal("usage: gif <path>")
		}
		doGIF(d, flag.Arg(1))
	case "webcam":
		streamWebcam(d)
	default:
		log.Fatalf("unknown subcommand: %s", flag.Arg(0))
	}
}

func doFill(d *display, hexColor string) {
	hexColor = strings.TrimPrefix(hexColor, "#")
	b, err := hex.DecodeString(hexColor)
	if err != nil || len(b) != 3 {
		log.Fatalf("invalid color %q: want RRGGBB hex", hexColor)
	}
	c := color.RGBA{R: b[0], G: b[1], B: b[2], A: 255}

	p := make([]color.Color, d.width*d.height)
	for i := range p {
		p[i] = c
	}
	if err := d.apply(p); err != nil {
		log.Fatalf("apply: %v", err)
	}
	log.Printf("fill #%s — Ctrl-C to clear", hexColor)
	waitForInterrupt()
}

func doImage(d *display, path string) {
	f, err := os.Open(path)
	if err != nil {
		log.Fatalf("open: %v", err)
	}
	defer f.Close()

	img, _, err := image.Decode(f)
	if err != nil {
		log.Fatalf("decode: %v", err)
	}

	if err := d.apply(d.fromImage(img)); err != nil {
		log.Fatalf("apply: %v", err)
	}
	log.Println("image displayed — Ctrl-C to clear")
	waitForInterrupt()
}

func doGIF(d *display, path string) {
	f, err := os.Open(path)
	if err != nil {
		log.Fatalf("open gif: %v", err)
	}
	defer f.Close()

	g, err := gif.DecodeAll(f)
	if err != nil {
		log.Fatalf("decode gif: %v", err)
	}

	quit := make(chan struct{})
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	go func() { <-sigCh; close(quit) }()

	// Composite GIF frames onto a running canvas to handle partial frames.
	canvas := image.NewRGBA(image.Rect(0, 0, g.Config.Width, g.Config.Height))
	log.Println("playing GIF — Ctrl-C to stop")
	for {
		for i, frame := range g.Image {
			select {
			case <-quit:
				return
			default:
			}

			draw.Draw(canvas, frame.Bounds(), frame, frame.Bounds().Min, draw.Over)
			if err := d.apply(d.fromImage(canvas)); err != nil {
				log.Printf("apply: %v", err)
				return
			}

			delay := time.Duration(g.Delay[i]) * 10 * time.Millisecond
			if delay < 50*time.Millisecond {
				delay = 50 * time.Millisecond
			}
			select {
			case <-quit:
				return
			case <-time.After(delay):
			}
		}
	}
}

// streamWebcam runs ffmpeg continuously, reading raw RGBA frames at ~5 fps and
// pushing each frame to the display. Runs until Ctrl-C or ffmpeg exits.
// Requires ffmpeg (brew install ffmpeg).
func streamWebcam(d *display) {
	const frameSize = displayW * displayH * 4
	const vfLetterbox = "scale=%d:%d:force_original_aspect_ratio=decrease," +
		"pad=%d:%d:(ow-iw)/2:(oh-ih)/2"

	cmd := exec.Command("ffmpeg",
		"-f", "avfoundation", "-framerate", "30", "-i", "0",
		"-r", "5",
		"-vf", fmt.Sprintf(vfLetterbox, d.width, d.height, d.width, d.height),
		"-f", "rawvideo", "-pix_fmt", "rgba",
		"pipe:1",
	)
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		log.Fatalf("pipe: %v", err)
	}
	cmd.Stderr = os.Stderr

	if err := cmd.Start(); err != nil {
		log.Fatalf("ffmpeg: %v\n(is ffmpeg installed? brew install ffmpeg)", err)
	}

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	go func() { <-sigCh; cmd.Process.Kill() }()

	buf := make([]byte, frameSize)
	for {
		if _, err := io.ReadFull(stdout, buf); err != nil {
			break
		}
		p := make([]color.Color, d.width*d.height)
		for i := range p {
			p[i] = color.RGBA{R: buf[i*4], G: buf[i*4+1], B: buf[i*4+2], A: buf[i*4+3]}
		}
		if err := d.apply(p); err != nil {
			log.Printf("apply: %v", err)
			break
		}
	}
	cmd.Wait()
}

func waitForInterrupt() {
	ch := make(chan os.Signal, 1)
	signal.Notify(ch, syscall.SIGINT, syscall.SIGTERM)
	<-ch
}
