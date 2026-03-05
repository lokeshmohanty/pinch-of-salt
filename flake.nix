{
  description = "A development environment for Pinch of Salt";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils, ... }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs {
          inherit system;
        };
      in
      {
        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            sqlite
            just
            uv
            python311
            git-lfs
          ];

          shellHook = ''
            export HF_TOKEN="your_hf_token_here"
            echo "🍎 Welcome to the Pinch of Salt Python environment!"
            echo "Run 'just' to see available commands."
          '';
        };
      }
    );
}
