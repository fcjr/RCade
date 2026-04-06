let
  # Maintainer SSH public keys (anyone who can encrypt/re-key secrets)
  # Each maintainer can have multiple keys (e.g. laptop + desktop)
  frank = [
    "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIGhBgDfImfTT4FQX6feRvOtkFJWPswFo7EG5VGjYDOs4"
    "age1yubikey1qfmlnj83rsrxsv7mcwc2nhdspjgphg7yp9dqhkj75k8vvaj78va8sp3086t"
  ];
  rose = [ "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIKpmuAVPQUMOZhy+a/54Rh/vwbhx9j5HU2rnhyExw01r" ];
  stephen = [ "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIH2lZ4I7sx+uEtwlbxxxMl8/aGz5rJNwJQvAVy6dSMHz" ];
  maintainers = frank ++ rose ++ stephen;

  # Machine SSH host keys (so machines can decrypt their own secrets at boot)
  rcade-nuc = [ "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIBLYTkvRcsC6MtfUT57FtPAtgE3UsDeNYOA5aU73jTk0" ];
  rcade-marquee = [ "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAINIGWYMEjeoeJwYzLySPdYi//FTs5bvI6sK2G8sSh2te" ];
in
{
  # WiFi PSK for the Recurse Center network (shared by all machines)
  "wifi-psk.age".publicKeys = maintainers ++ rcade-nuc ++ rcade-marquee;

  # Cabinet API key environment file (used by rcade-nuc)
  "cabinet-secrets-env.age".publicKeys = maintainers ++ rcade-nuc;
}
