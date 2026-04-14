{ config, ... }:
{
  age.secrets.wifi-psk.file = ../../secrets/wifi-psk.age;

  networking.wireless.networks."Recurse Center" = {
    pskRaw = "ext:PSK";
  };
  networking.wireless.secretsFile = config.age.secrets.wifi-psk.path;
}
