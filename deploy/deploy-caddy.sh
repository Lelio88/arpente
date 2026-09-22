#!/bin/sh
# Installe le vhost Caddy d'Arpente sur le serveur, puis recharge Caddy.
#
# Le fichier versionné (deploy/caddy/arpente.caddy) est la source de vérité ;
# le serveur n'en garde qu'une copie, importée par son Caddyfile.
#
# Choix non évidents :
#   - « caddy validate » AVANT le rechargement : ce Caddy sert aussi
#     CulturiaQuests, Lumis et Agora ; une configuration invalide les
#     couperait tous. En cas d'échec, l'ancienne copie est remise et rien
#     n'est rechargé ;
#   - la ligne d'import du Caddyfile de l'hôte n'est posée qu'une fois, à la
#     main : ce script ne modifie jamais le fichier des autres projets.
#
#   sh deploy/deploy-caddy.sh root@167.233.156.2

set -eu

TARGET=${1:?usage : deploy-caddy.sh <utilisateur@serveur>}
HERE=$(cd "$(dirname "$0")" && pwd)

scp "$HERE/caddy/arpente.caddy" "$TARGET:/tmp/arpente.caddy"
ssh "$TARGET" 'sh -s' <<'EOS'
set -eu
DEST=/opt/arpente/caddy/arpente.caddy
mkdir -p /opt/arpente/caddy
if ! grep -qF "import $DEST" /etc/caddy/Caddyfile; then
    echo "ERREUR : le Caddyfile de l'hôte n'importe pas $DEST."
    echo "Ajouter une fois la ligne « import $DEST », puis relancer."
    exit 1
fi
[ -f "$DEST" ] && cp "$DEST" "$DEST.bak"
install -m 644 /tmp/arpente.caddy "$DEST"
rm -f /tmp/arpente.caddy
if ! caddy validate --config /etc/caddy/Caddyfile >/dev/null 2>&1; then
    echo "ERREUR : configuration invalide, ancien vhost remis, Caddy inchangé."
    [ -f "$DEST.bak" ] && mv "$DEST.bak" "$DEST"
    exit 1
fi
rm -f "$DEST.bak"
systemctl reload caddy
echo "vhost installé et Caddy rechargé"
EOS
