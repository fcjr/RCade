package main

import (
	"encoding/hex"
	"flag"
	"fmt"
	"image"
	"image/color"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"log"
	"os"
	"os/exec"
	"os/signal"
	"strings"
	"syscall"

	"github.com/disintegration/imaging"
	rgbmatrix "github.com/fcjr/rgbmatrix-rpi"
	"github.com/fcjr/rgbmatrix-rpi/rpc"
)

const displayW, displayH = 128, 32

var addr = flag.String("addr", "100.123.178.9:1234", "marquee RPC server address")

func main() {
	flag.Parse()
	if flag.NArg() == 0 {
		fmt.Fprintln(os.Stderr, "usage: marquee-client [--addr host:port] <fill|image|gif|webcam> [args]")
		os.Exit(1)
	}

	m, err := rpc.NewClient("tcp", *addr)
	if err != nil {
		log.Fatalf("connect: %v", err)
	}

	switch flag.Arg(0) {
	case "fill":
		if flag.NArg() < 2 {
			log.Fatal("usage: fill <RRGGBB>")
		}
		doFill(m, flag.Arg(1))
	case "image":
		if flag.NArg() < 2 {
			log.Fatal("usage: image <path>")
		}
		doImage(m, loadAndScale(flag.Arg(1)))
	case "gif":
		if flag.NArg() < 2 {
			log.Fatal("usage: gif <path>")
		}
		doGIF(m, flag.Arg(1))
	case "webcam":
		streamWebcam(m) // blocks until Ctrl-C
	default:
		log.Fatalf("unknown subcommand: %s", flag.Arg(0))
	}
}

// doFill flood-fills the display with a hex color and holds it until Ctrl-C.
func doFill(m rgbmatrix.Matrix, hexColor string) {
	hexColor = strings.TrimPrefix(hexColor, "#")
	b, err := hex.DecodeString(hexColor)
	if err != nil || len(b) != 3 {
		log.Fatalf("invalid color %q: want RRGGBB hex", hexColor)
	}
	c := rgbmatrix.NewCanvas(m)
	defer c.Close()

	col := color.RGBA{R: b[0], G: b[1], B: b[2], A: 255}
	bounds := c.Bounds()
	for x := bounds.Min.X; x < bounds.Max.X; x++ {
		for y := bounds.Min.Y; y < bounds.Max.Y; y++ {
			c.Set(x, y, col)
		}
	}
	if err := c.Render(); err != nil {
		log.Fatalf("render: %v", err)
	}
	log.Printf("fill #%s — Ctrl-C to clear", hexColor)
	waitForInterrupt()
}

// doImage displays a pre-scaled image and holds it until Ctrl-C.
func doImage(m rgbmatrix.Matrix, img image.Image) {
	tk := rgbmatrix.NewToolKit(m)
	defer tk.Close()

	c := tk.Canvas
	bounds := c.Bounds()
	for y := bounds.Min.Y; y < bounds.Max.Y; y++ {
		for x := bounds.Min.X; x < bounds.Max.X; x++ {
			c.Set(x, y, img.At(x, y))
		}
	}
	if err := c.Render(); err != nil {
		log.Fatalf("render: %v", err)
	}
	log.Println("image displayed — Ctrl-C to clear")
	waitForInterrupt()
}

// doGIF plays an animated GIF until Ctrl-C.
func doGIF(m rgbmatrix.Matrix, path string) {
	f, err := os.Open(path)
	if err != nil {
		log.Fatalf("open gif: %v", err)
	}
	defer f.Close()

	tk := rgbmatrix.NewToolKit(m)
	defer tk.Close()

	quit, err := tk.PlayGIF(f)
	if err != nil {
		log.Fatalf("play gif: %v", err)
	}
	log.Println("playing GIF — Ctrl-C to stop")
	waitForInterrupt()
	quit <- true
}

// streamWebcam runs ffmpeg continuously, reading raw RGBA frames at ~5 fps and
// pushing each frame to the display. Letterboxes to preserve aspect ratio.
// Runs until Ctrl-C or ffmpeg exits.
// Requires ffmpeg (brew install ffmpeg).
func streamWebcam(m rgbmatrix.Matrix) {
	const frameSize = displayW * displayH * 4 // RGBA bytes per frame
	const vfLetterbox = "scale=%d:%d:force_original_aspect_ratio=decrease," +
		"pad=%d:%d:(ow-iw)/2:(oh-ih)/2"

	cmd := exec.Command("ffmpeg",
		"-f", "avfoundation", "-i", "0",
		"-r", "5",
		"-vf", fmt.Sprintf(vfLetterbox, displayW, displayH, displayW, displayH),
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
	go func() {
		<-sigCh
		cmd.Process.Kill()
	}()

	c := rgbmatrix.NewCanvas(m)
	defer c.Close()

	buf := make([]byte, frameSize)
	for {
		if _, err := io.ReadFull(stdout, buf); err != nil {
			break // ffmpeg exited or was killed
		}
		for i := 0; i < displayW*displayH; i++ {
			x := i % displayW
			y := i / displayW
			c.Set(x, y, color.RGBA{R: buf[i*4], G: buf[i*4+1], B: buf[i*4+2], A: buf[i*4+3]})
		}
		if err := c.Render(); err != nil {
			log.Printf("render: %v", err)
			break
		}
	}
	cmd.Wait()
}

// loadAndScale opens an image file and scales it to fit the display (letterboxed).
func loadAndScale(path string) image.Image {
	f, err := os.Open(path)
	if err != nil {
		log.Fatalf("open image: %v", err)
	}
	defer f.Close()

	img, _, err := image.Decode(f)
	if err != nil {
		log.Fatalf("decode image: %v", err)
	}

	scaled := imaging.Fit(img, displayW, displayH, imaging.Lanczos)
	canvas := imaging.New(displayW, displayH, color.Black)
	x := (displayW - scaled.Bounds().Dx()) / 2
	y := (displayH - scaled.Bounds().Dy()) / 2
	return imaging.Paste(canvas, scaled, image.Pt(x, y))
}

func waitForInterrupt() {
	ch := make(chan os.Signal, 1)
	signal.Notify(ch, syscall.SIGINT, syscall.SIGTERM)
	<-ch
}
