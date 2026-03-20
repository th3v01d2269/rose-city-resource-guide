#!/data/data/com.termux/files/usr/bin/bash
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
G='\033[0;32m';Y='\033[1;33m';C='\033[0;36m';B='\033[1m';X='\033[0m'
while true; do
  echo -e "\n${B}╔══════════════════════════════════════╗"
  echo -e "║  🌹  Resource Guide — Menu           ║"
  echo -e "╚══════════════════════════════════════╝${X}"
  echo -e "  ${C}1${X}  Start server"
  echo -e "  ${C}2${X}  DB setup"
  echo -e "  ${C}3${X}  Seed data"
  echo -e "  ${C}4${X}  Force reseed"
  echo -e "  ${C}5${X}  Backup DB"
  echo -e "  ${C}6${X}  Git pull + update"
  echo -e "  ${C}7${X}  Test API"
  echo -e "  ${C}8${X}  DB stats"
  echo -e "  ${C}9${X}  Show .env"
  echo -e "  ${C}q${X}  Quit\n"
  read -rp "  Choose: " c
  cd "$DIR"
  case "$c" in
    1) npm start ;;
    2) node scripts/db-setup.js ;;
    3) node scripts/seed.js ;;
    4) node scripts/seed.js --force ;;
    5) node scripts/backup.js ;;
    6) git pull origin main && npm install ;;
    7)
      P=${PORT:-3000}
      echo "--- /health ---"
      curl -s "http://localhost:$P/health" | python3 -m json.tool 2>/dev/null || echo "Not running"
      echo "--- /api/meta (first 20 lines) ---"
      curl -s "http://localhost:$P/api/meta" | python3 -m json.tool 2>/dev/null | head -20 || true
      ;;
    8)
      node -e "
        require('dotenv').config();
        const {Pool}=require('pg');
        const p=new Pool({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}});
        p.query('SELECT COUNT(*) c,COUNT(DISTINCT state) s,COUNT(DISTINCT category) k FROM resources')
         .then(r=>{const d=r.rows[0];console.log('Resources:',d.c,'States:',d.s,'Categories:',d.k);p.end();})
         .catch(e=>{console.error(e.message);p.end();});
      " ;;
    9) cat .env ;;
    q|Q) exit 0 ;;
    *) echo "Invalid" ;;
  esac
done
