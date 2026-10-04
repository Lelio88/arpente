#!/bin/sh
# Met en ligne le service d'Arpente et la configuration des comptes :
#   1. construit l'image du service ICI, depuis le commit courant (le serveur,
#      partagé avec trois autres projets, ne compile rien) ;
#   2. l'envoie au serveur (docker save | docker load), avec le compose
#      (docker-compose.yml), son ajout (docker-compose.comptes.yml) et les
#      gabarits d'e-mail ;
#   3. recrée auth et service, puis sonde le service.
#
# Choix non évidents :
#   - l'arbre de travail doit être propre : l'image est étiquetée par le
#     commit, et une étiquette doit désigner exactement ce qui tourne ;
#   - SERVICE_TAG est la seule ligne du .env du serveur que ce script écrit ;
#     les secrets y sont posés à la main (production.env.example), jamais ici ;
#   - les interrupteurs (ANONYME_ACTIF, CAPTCHA_ACTIF, GOOGLE_ACTIF,
#     OAUTH_ACTIF) ne sont pas touchés : ils suivent l'ordre de mise en ligne
#     de docs/mcp-architecture.md.
#
#   sh deploy/deploy-service.sh root@167.233.156.2

set -eu

TARGET=${1:?usage : deploy-service.sh <utilisateur@serveur>}
HERE=$(cd "$(dirname "$0")" && pwd)
RACINE=$(dirname "$HERE")

if [ -n "$(git -C "$RACINE" status --porcelain)" ]; then
    echo "ERREUR : arbre de travail modifié — committer avant de mettre en ligne."
    exit 1
fi
TAG=$(git -C "$RACINE" rev-parse --short HEAD)

echo "Image arpente-service:$TAG…"
docker build -q -f "$RACINE/service/Dockerfile" -t "arpente-service:$TAG" "$RACINE" >/dev/null
docker save "arpente-service:$TAG" | gzip | ssh "$TARGET" 'gunzip | docker load' >/dev/null

ssh "$TARGET" 'mkdir -p /tmp/arpente-deploy/email'
scp -q "$HERE/docker-compose.yml" "$HERE/docker-compose.comptes.yml" "$TARGET:/tmp/arpente-deploy/"
scp -q "$HERE"/email/*.html "$TARGET:/tmp/arpente-deploy/email/"

ssh "$TARGET" "TAG=$TAG sh -s" <<'EOS'
set -eu
cd /opt/arpente
install -d -m 755 email
install -m 644 /tmp/arpente-deploy/email/*.html email/
[ -f docker-compose.yml ] && cp docker-compose.yml "docker-compose.yml.bak-$(date +%F)"
install -m 644 /tmp/arpente-deploy/docker-compose.yml docker-compose.yml
install -m 644 /tmp/arpente-deploy/docker-compose.comptes.yml docker-compose.comptes.yml
rm -rf /tmp/arpente-deploy
if grep -q '^SERVICE_TAG=' .env; then
    sed -i "s/^SERVICE_TAG=.*/SERVICE_TAG=$TAG/" .env
else
    echo "SERVICE_TAG=$TAG" >> .env
fi
docker compose -f docker-compose.yml -f docker-compose.comptes.yml up -d auth service
for i in $(seq 1 30); do
    if wget -q -O /dev/null http://127.0.0.1:3012/sante 2>/dev/null || curl -fsS -o /dev/null http://127.0.0.1:3012/sante 2>/dev/null; then
        echo "service en ligne : arpente-service:$TAG"
        exit 0
    fi
    sleep 2
done
echo "ERREUR : le service ne répond pas sur /sante."
docker logs --tail 30 arpente_service
exit 1
EOS
