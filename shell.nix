{
  pkgs ? import <nixpkgs> { },
}:

let
  critFlake = builtins.getFlake "github:tomasz-tomczyk/crit";
  crit = critFlake.packages.${builtins.currentSystem}.default;
in
pkgs.mkShell {
  buildInputs = with pkgs; [
    nodejs
    pnpm_10
    crit
  ];
}
