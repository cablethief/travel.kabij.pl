{
  description = "Contravel dev environment — Node, cloudflared, and jj for the git+jj colocated workflow";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };
      in
      {
        devShells.default = pkgs.mkShell {
          packages = [
            pkgs.nodejs_24 # matches .nvmrc — npm, astro, all the .githooks/lib scripts
            pkgs.cloudflared # `cloudflared access login`/`access token`, used by publish-images
            pkgs.jujutsu # this repo's actual VCS (colocated with git)
            pkgs.git
          ];

          shellHook = ''
            echo "contravel dev shell — node $(node --version), $(cloudflared --version | head -1), $(jj --version)"
            if [ ! -d node_modules ]; then
              echo "Run 'npm install' to finish setup (installs deps, wires up git hooks)."
            fi
          '';
        };
      });
}
