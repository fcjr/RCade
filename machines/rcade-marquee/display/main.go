package main

import (
	"flag"
	"log"

	rgbmatrix "github.com/fcjr/rgbmatrix-rpi"
	"github.com/fcjr/rgbmatrix-rpi/rpc"
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
		DropPrivileges: 1, // ask library to drop privileges after init
		DoGPIOInit:     true,
	}

	// Diagnostics: log configs so journalctl shows what we passed in
	log.Printf("HardwareConfig: %+v", hc)
	log.Printf("RuntimeOptions: %+v", rc)

	m, err := rgbmatrix.NewRGBLedMatrix(hc, rc)
	if err != nil {
		log.Printf("NewRGBLedMatrix error: %v", err)
		return
	}
	defer m.Close()

	log.Println("marquee-display RPC server listening on :1234")
	rpc.Serve(m) // blocks; systemd Restart=on-failure handles crashes
}
