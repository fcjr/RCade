package main

import (
	"flag"
	"image/color"
	"log"

	rgbmatrix "github.com/fcjr/rgbmatrix-rpi"
)

var gpioSlowdown = flag.Bool("gpio-slowdown", false, "Apply GPIO slowdown (use if display is glitchy on Pi 4)")

func main() {
	flag.Parse()

	gpioSpeed := 0
	if *gpioSlowdown {
		gpioSpeed = 4
	}

	hc := &rgbmatrix.HardwareConfig{
		HardwareMapping:   "adafruit-hat",
		Rows:              32,
		Cols:              64,
		ChainLength:       2,
		Parallel:          1,
		PWMBits:           11,
		PWMLSBNanoseconds: 130,
		Brightness:        50,
		ScanMode:          rgbmatrix.Progressive,
	}
	rc := &rgbmatrix.RuntimeOptions{
		GPIOSlowdown:   gpioSpeed,
		Daemon:         0,
		DropPrivileges: 0,
		DoGPIOInit:     true,
	}

	m, err := rgbmatrix.NewRGBLedMatrix(hc, rc)
	if err != nil {
		log.Fatalf("failed to initialize matrix: %v", err)
	}

	c := rgbmatrix.NewCanvas(m)
	defer c.Close()

	bounds := c.Bounds()
	for x := bounds.Min.X; x < bounds.Max.X; x++ {
		for y := bounds.Min.Y; y < bounds.Max.Y; y++ {
			c.Set(x, y, color.RGBA{R: 255, G: 0, B: 0, A: 255})
		}
	}
	if err := c.Render(); err != nil {
		log.Fatalf("render failed: %v", err)
	}

	// Block forever — systemd Restart=on-failure handles reconnect after crashes
	select {}
}
