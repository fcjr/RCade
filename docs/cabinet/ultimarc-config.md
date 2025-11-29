## Configuring Ultimarc J-PAC with umtool on Raspberry Pi

### Setup

  Use my fork which adds support for newer J-PAC (0x0452) and semicolon key mapping:

  ```bash
  git clone https://github.com/fcjr/Ultimarc-linux
  cd Ultimarc-linux
  ./autogen.sh
  ./configure --disable-shared
  make

  # Install udev rules
  sudo cp 21-ultimarc.rules /etc/udev/rules.d/
  sudo udevadm control --reload-rules

  Unplug and replug your J-PAC.

  Config File Format (config.json)

  {
    "version": 2,
    "product": "jpac",
    "config": { "debounce": "standard" },
    "1/2 shift key": "",
    "macros": {},
    "pins": {
      "1up": { "key": "w", "shift": "" },
      "1down": { "key": "s", "shift": "" },
      ...
    }
  }

  Running umtool

  sudo ./src/umtool/umtool config.json
