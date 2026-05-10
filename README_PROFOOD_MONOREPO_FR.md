# Système RAG Profood — README complet de A à Z

Ce README est conçu pour que n’importe quel membre de l’équipe puisse cloner le projet, installer les dépendances, lancer les services et ouvrir toute l’application dans le navigateur, même s’il débute.

---

## 0. Qu’est-ce que ce projet ?

Ce projet est un **système de chatbot RAG** avec un **prototype d’authentification**.

Idée générale :

```text
Utilisateur
  ↓
Frontend Angular Auth
  ↓ login / register
API Express Auth
  ↓ JWT token + MongoDB Atlas
Angular / Application principale
  ↓ envoie question + token/contexte utilisateur
API FastAPI RAG
  ↓ ChromaDB + Ollama + documents
Réponse de Profood AI
```

Nous avons 3 projets dans un seul repository :

```text
PFE/
│
├── profood-rag-ollama/
│   └── profood-rag-ollama/
│       ├── app/
│       ├── data/
│       ├── scripts/
│       ├── requirements.txt
│       ├── .env.example
│       └── README.md
│
├── profood-auth-service/
│   ├── src/
│   ├── package.json
│   ├── package-lock.json
│   └── .env.example
│
├── profood-auth-frontend/
│   ├── src/
│   ├── angular.json
│   ├── package.json
│   └── package-lock.json
│
├── .gitignore
└── README.md
```

---

## 1. Rôle de chaque projet

### 1.1 `profood-rag-ollama/profood-rag-ollama`

C’est le **backend FastAPI RAG**.

Il utilise :

```text
FastAPI
LangChain
ChromaDB
Ollama
Loaders PDF / TXT / MD / JSON / CSV / DOCX / Excel
```

Son rôle :

```text
1. Lire les documents
2. Les découper en chunks
3. Créer les embeddings
4. Les stocker dans ChromaDB
5. Recevoir une question
6. Chercher les chunks pertinents
7. Donner le contexte à Ollama
8. Retourner une réponse + les sources
```

### 1.2 `profood-auth-service`

C’est l’**API d’authentification Express.js** pour les tests.

Elle utilise :

```text
Express.js
MongoDB Atlas
Mongoose
bcryptjs
JWT
```

Son rôle :

```text
1. Register
2. Login
3. Générer un JWT token
4. Vérifier l’utilisateur courant avec /auth/me
```

Important : ce système d’authentification est seulement un prototype. En production, il sera remplacé par l’authentification de l’entreprise.

### 1.3 `profood-auth-frontend`

C’est le **frontend Angular** de l’authentification.

Son rôle :

```text
1. Afficher la page login/register
2. Appeler l’API Express Auth
3. Stocker le JWT token dans le localStorage du navigateur
4. Après login, rediriger l’utilisateur vers l’application RAG si nécessaire
```

---

# PARTIE A — Exécution en local sur PC

---

## 2. Prérequis avant de commencer

Il faut avoir :

```text
1. Git
2. Python 3.10+
3. Node.js + npm
4. Angular CLI
5. Ollama
6. Un compte MongoDB Atlas
7. VS Code, optionnel mais recommandé
```

---

## 3. Installer Git

Vérifier si Git est déjà installé :

```bash
git --version
```

Si une version s’affiche, c’est bon.

Sinon, installer Git depuis :

```text
https://git-scm.com/downloads
```

Après l’installation, fermer puis rouvrir le terminal.

---

## 4. Installer Python

Vérifier si Python est installé :

```powershell
python --version
```

Ou :

```powershell
py --version
```

Si tu obtiens `Python 3.10` ou plus, c’est bon.

Sinon, installer Python depuis :

```text
https://www.python.org/downloads/
```

Important sous Windows : quand l’installeur s’ouvre, cocher :

```text
Add python.exe to PATH
```

Après l’installation :

```powershell
python --version
pip --version
```

---

## 5. Installer Node.js et npm

Vérifier si Node existe :

```powershell
node -v
npm -v
```

Si ce n’est pas installé, installer Node.js LTS depuis :

```text
https://nodejs.org/en/download
```

Choisir **LTS**.

Après l’installation, fermer puis rouvrir le terminal :

```powershell
node -v
npm -v
```

---

## 6. Installer Angular CLI

Le frontend Angular a besoin d’Angular CLI :

```powershell
npm install -g @angular/cli
```

Vérifier :

```powershell
ng version
```

---

## 7. Installer Ollama

Ollama sert à exécuter les modèles IA localement.

### Windows

Installer Ollama depuis :

```text
https://ollama.com/download/windows
```

Ou via PowerShell :

```powershell
irm https://ollama.com/install.ps1 | iex
```

Vérifier :

```powershell
ollama --version
```

### Télécharger les modèles

Nous avons besoin de deux modèles :

```powershell
ollama pull llama3.2
ollama pull nomic-embed-text
```

Explication simple :

```text
llama3.2          → modèle qui génère la réponse
nomic-embed-text  → modèle qui crée les embeddings
```

Vérifier :

```powershell
ollama list
```

---

## 8. Configuration MongoDB Atlas

MongoDB Atlas est la base de données cloud utilisée pour l’authentification et, plus tard, éventuellement pour l’historique des conversations.

Étapes générales :

```text
1. Aller sur MongoDB Atlas
2. Créer un cluster gratuit
3. Créer un utilisateur de base de données
4. Activer Network Access
5. Copier la connection string
```

### Network Access

Dans Atlas :

```text
Security
→ Network Access
→ Add IP Address
→ Allow Access From Anywhere
```

Pour les tests seulement, utiliser :

```text
0.0.0.0/0
```

En production, il faut limiter l’accès à l’adresse IP du serveur uniquement.

### Exemple de connection string

Atlas va donner quelque chose comme :

```text
mongodb+srv://<db_username>:<db_password>@cluster0.xxxxx.mongodb.net/?appName=Cluster0
```

Nous ajoutons le nom de la base de données :

```text
mongodb+srv://USERNAME:PASSWORD@cluster0.xxxxx.mongodb.net/profood_auth?retryWrites=true&w=majority&appName=Cluster0
```

---

## 9. Cloner le projet

Dans le dossier où tu veux travailler :

```powershell
cd C:\Users\msi\Desktop\programation
```

Cloner le repository :

```powershell
git clone YOUR_REPOSITORY_URL
```

Entrer dans le projet :

```powershell
cd PFE
```

Vérifier la structure :

```powershell
dir
```

Tu dois voir :

```text
profood-rag-ollama
profood-auth-service
profood-auth-frontend
```

---

# 10. Configuration du backend Express Auth

## 10.1 Entrer dans le dossier

```powershell
cd C:\Users\msi\Desktop\programation\PFE\profood-auth-service
```

## 10.2 Installer les packages

```powershell
npm install
```

Cette commande lit `package.json` et crée `node_modules`.

## 10.3 Créer le fichier `.env`

Si tu as `.env.example`, le copier :

```powershell
Copy-Item .env.example .env
```

S’il n’existe pas, créer `.env` :

```powershell
notepad .env
```

Mettre dedans :

```env
PORT=4000
MONGO_URI=mongodb+srv://USERNAME:PASSWORD@cluster0.xxxxx.mongodb.net/profood_auth?retryWrites=true&w=majority&appName=Cluster0
JWT_SECRET=change_this_secret_later_123
JWT_EXPIRES_IN=7d
```

Remplacer :

```text
USERNAME
PASSWORD
cluster0.xxxxx.mongodb.net
```

par tes informations MongoDB Atlas.

## 10.4 Lancer l’API Express Auth

```powershell
npm run dev
```

Si tout va bien, tu dois voir :

```text
MongoDB connected successfully
Auth service running on http://localhost:4000
```

## 10.5 Tester dans le navigateur

Ouvrir :

```text
http://localhost:4000/api/health
```

Ou, si ton projet retourne le health check à la racine :

```text
http://localhost:4000
```

---

# 11. Configuration du frontend Angular

Ouvrir un nouveau terminal.

## 11.1 Entrer dans le dossier

```powershell
cd C:\Users\msi\Desktop\programation\PFE\profood-auth-frontend
```

## 11.2 Installer les packages

```powershell
npm install
```

## 11.3 Lancer Angular

```powershell
npm start
```

Angular va donner cette URL :

```text
http://localhost:4200
```

Ouvre-la dans le navigateur.

## 11.4 Tester Register / Login

Dans la page Angular :

```text
1. Faire Register
2. Faire Login
3. Après login, le token doit être stocké
4. Si la redirection est activée, tu seras redirigé vers FastAPI RAG
```

Si register affiche :

```text
Email already exists
```

c’est normal. Utilise Login ou bien un autre email.

---

# 12. Configuration du backend FastAPI RAG

Ouvrir un nouveau terminal.

## 12.1 Entrer dans le dossier

Le projet est probablement dans un dossier à l’intérieur d’un autre dossier :

```powershell
cd C:\Users\msi\Desktop\programation\PFE\profood-rag-ollama\profood-rag-ollama
```

Vérifie que tu es dans le dossier qui contient :

```text
app/
requirements.txt
.env.example
```

## 12.2 Créer un environnement virtuel

```powershell
python -m venv .venv
```

## 12.3 Activer l’environnement virtuel

PowerShell :

```powershell
.\.venv\Scripts\Activate.ps1
```

Si tu as une erreur d’execution policy :

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned
.\.venv\Scripts\Activate.ps1
```

Tu dois voir dans le terminal :

```text
(.venv)
```

## 12.4 Installer les packages Python

```powershell
pip install --upgrade pip
pip install -r requirements.txt
```

## 12.5 Créer le fichier `.env`

```powershell
Copy-Item .env.example .env
notepad .env
```

Mettre ou vérifier ces valeurs :

```env
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_CHAT_MODEL=llama3.2
OLLAMA_EMBEDDING_MODEL=nomic-embed-text

CHROMA_DIR=./data/chroma
PDF_DIR=./data/pdfs
COLLECTION_NAME=profood_rag

CHUNK_SIZE=900
CHUNK_OVERLAP=150
TOP_K=4

JWT_SECRET=change_this_secret_later_123
```

Important :

```text
JWT_SECRET doit être identique à celui du service Express Auth.
```

## 12.6 Vérifier qu’Ollama fonctionne

Dans un autre terminal :

```powershell
ollama list
```

Si Ollama ne tourne pas, lancer :

```powershell
ollama serve
```

## 12.7 Lancer FastAPI

```powershell
uvicorn app.main:app --reload
```

Tu dois voir :

```text
Uvicorn running on http://127.0.0.1:8000
```

---

# 13. Ajouter les données dans le RAG : Ingest

FastAPI RAG a besoin de documents pour répondre.

Mettre les fichiers dans :

```text
profood-rag-ollama/profood-rag-ollama/data/pdfs/
```

Même si le dossier s’appelle `pdfs`, le code peut supporter :

```text
.pdf
.txt
.md
.json
.csv
.docx
.xlsx
.xlsm
.xltx
.xltm
```

Exemples :

```text
data/pdfs/products.json
data/pdfs/equipment.csv
data/pdfs/forum_faq.md
data/pdfs/guide.pdf
data/pdfs/catalog.xlsx
```

## 13.1 Ingest depuis le navigateur

Ouvrir :

```text
http://127.0.0.1:8000/docs
```

Chercher :

```text
POST /ingest
```

Faire :

```text
Try it out
reset = true
Execute
```

La réponse doit ressembler à :

```json
{
  "message": "Documents ingested successfully.",
  "loaded_documents": 10,
  "created_chunks": 50,
  "chroma_dir": "...",
  "collection_name": "profood_rag"
}
```

## 13.2 Ingest depuis le terminal

```powershell
Invoke-RestMethod -Method Post "http://127.0.0.1:8000/ingest?reset=true"
```

---

# 14. Exécution quotidienne : que faut-il lancer à chaque fois ?

Il faut lancer 4 services :

```text
1. Ollama
2. Express Auth API
3. FastAPI RAG API
4. Angular Frontend
```

## Terminal 1 — Ollama

En général, Ollama tourne en arrière-plan, mais si nécessaire :

```powershell
ollama serve
```

## Terminal 2 — Express

```powershell
cd C:\Users\msi\Desktop\programation\PFE\profood-auth-service
npm run dev
```

## Terminal 3 — FastAPI

```powershell
cd C:\Users\msi\Desktop\programation\PFE\profood-rag-ollama\profood-rag-ollama
.\.venv\Scripts\Activate.ps1
uvicorn app.main:app --reload
```

## Terminal 4 — Angular

```powershell
cd C:\Users\msi\Desktop\programation\PFE\profood-auth-frontend
npm start
```

## Navigateur

Ouvrir :

```text
http://localhost:4200
```

---

# 15. Comment les services communiquent entre eux ?

## Angular → Express

Angular appelle Express :

```text
POST http://localhost:4000/auth/register
POST http://localhost:4000/auth/login
GET  http://localhost:4000/auth/me
```

Express retourne un JWT token.

## Angular → FastAPI RAG

Angular doit envoyer le token avec `/ask` :

```http
Authorization: Bearer JWT_TOKEN
```

Request :

```json
{
  "question": "What equipment do I need for olive oil production?",
  "k": 4,
  "filters": {
    "doc_type": "equipment"
  }
}
```

## FastAPI → Ollama

FastAPI communique avec Ollama :

```text
http://localhost:11434
```

## FastAPI → ChromaDB

FastAPI stocke les embeddings dans :

```text
data/chroma/
```

Ce dossier est généré automatiquement. Il ne faut pas le pousser sur GitHub.

---

# 16. Fichiers importants

## Express Auth

```text
profood-auth-service/src/server.js
profood-auth-service/src/db.js
profood-auth-service/src/routes/auth.routes.js
profood-auth-service/src/models/User.js
profood-auth-service/src/middleware/auth.middleware.js
```

## Angular

```text
profood-auth-frontend/src/app/app.component.ts
profood-auth-frontend/src/app/auth.service.ts
```

## FastAPI RAG

```text
profood-rag-ollama/profood-rag-ollama/app/main.py
profood-rag-ollama/profood-rag-ollama/app/rag.py
profood-rag-ollama/profood-rag-ollama/app/config.py
profood-rag-ollama/profood-rag-ollama/app/schemas.py
profood-rag-ollama/profood-rag-ollama/app/auth.py
```

---

# 17. Règles Git

## À ne pas pousser sur GitHub

```text
.env
node_modules/
.venv/
my_env/
data/chroma/
__pycache__/
dist/
.angular/
```

## À pousser sur GitHub

```text
.env.example
requirements.txt
package.json
package-lock.json
src/
app/
README.md
.gitignore
```

## `.gitignore` à la racine

Dans la racine de `PFE` :

```gitignore
# Environment files
.env
.env.local
.env.*.local

# Python
.venv/
my_env/
__pycache__/
*.pyc
*.pyo
*.pyd
data/chroma/

# Node / Angular / Express
node_modules/
dist/
.angular/

# Logs
*.log
npm-debug.log*

# Editor / OS
.vscode/
.idea/
.DS_Store
Thumbs.db
```

---

# 18. Problèmes fréquents et solutions

## 18.1 `python is not recognized`

Python n’a pas été ajouté au PATH.

Solution :

```text
Réinstaller Python
et cocher Add python.exe to PATH
```

Ou essayer :

```powershell
py --version
```

## 18.2 PowerShell execution policy

Si tu vois :

```text
running scripts is disabled on this system
```

Faire :

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned
```

Puis :

```powershell
.\.venv\Scripts\Activate.ps1
```

## 18.3 `npm is not recognized`

Node.js n’est pas installé ou le terminal doit être redémarré.

Solution :

```text
Installer Node.js LTS
Fermer le terminal puis le rouvrir
```

## 18.4 MongoDB `querySrv ECONNREFUSED`

Si Express n’arrive pas à se connecter à Atlas et affiche :

```text
querySrv ECONNREFUSED _mongodb._tcp.cluster0...
```

Tester le DNS :

```powershell
node -e "const dns=require('dns'); dns.setServers(['8.8.8.8','1.1.1.1']); dns.resolveSrv('_mongodb._tcp.cluster0.YOUR_CLUSTER.mongodb.net', (err, records) => console.log(err || records))"
```

Si ça fonctionne, ajouter dans `src/db.js` :

```js
const dns = require("dns");
dns.setServers(["8.8.8.8", "1.1.1.1"]);
```

## 18.5 `Email already exists`

C’est normal.

Solution :

```text
Faire login
ou register avec un autre email
```

## 18.6 FastAPI `/ask` retourne 401

Cela veut dire que le token n’a pas été envoyé ou qu’il est incorrect.

La request doit contenir :

```http
Authorization: Bearer TOKEN
```

## 18.7 Ollama connection error

Vérifier qu’Ollama fonctionne :

```powershell
ollama list
```

Vérifier aussi les modèles :

```powershell
ollama pull llama3.2
ollama pull nomic-embed-text
```

## 18.8 Le RAG dit qu’il n’a pas de données

Il faut faire l’ingestion :

```text
http://127.0.0.1:8000/docs
POST /ingest
reset=true
```

---

# PARTIE B — Exécution dans Google Colab

## 19. Peut-on exécuter le projet dans Colab ?

Oui, c’est possible, mais il faut comprendre :

```text
Colab est surtout adapté pour tester FastAPI RAG + Ollama.
Exécuter Angular + Express + RAG complètement dans Colab est possible, mais un peu pénible à cause des proxy URLs et de localhost.
```

Meilleur usage de Colab :

```text
1. Cloner le repo
2. Lancer FastAPI RAG
3. Installer Ollama
4. Ingest les documents
5. Tester /ask
```

---

## 20. Colab : lancer FastAPI RAG + Ollama

Ouvrir un nouveau notebook Google Colab.

### Cellule 1 — Cloner le repo

```python
!git clone YOUR_REPOSITORY_URL
```

Entrer dans le projet :

```python
%cd PFE/profood-rag-ollama/profood-rag-ollama
```

Si le nom du repo n’est pas `PFE`, le remplacer par le bon nom.

### Cellule 2 — Installer les requirements Python

```python
!pip install -r requirements.txt
```

### Cellule 3 — Installer Ollama

```python
!curl -fsSL https://ollama.com/install.sh | sh
```

### Cellule 4 — Démarrer le serveur Ollama

```python
!nohup ollama serve > ollama.log 2>&1 &
```

Attendre un peu :

```python
import time
time.sleep(5)
```

### Cellule 5 — Télécharger les modèles

```python
!ollama pull llama3.2
!ollama pull nomic-embed-text
```

Vérifier :

```python
!ollama list
```

### Cellule 6 — Créer `.env`

```python
%%writefile .env
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_CHAT_MODEL=llama3.2
OLLAMA_EMBEDDING_MODEL=nomic-embed-text

CHROMA_DIR=./data/chroma
PDF_DIR=./data/pdfs
COLLECTION_NAME=profood_rag

CHUNK_SIZE=900
CHUNK_OVERLAP=150
TOP_K=4

JWT_SECRET=change_this_secret_later_123
```

### Cellule 7 — Ajouter des données de test si elles n’existent pas

```python
!mkdir -p data/pdfs
```

Petit exemple JSON :

```python
%%writefile data/pdfs/products.json
[
  {
    "type": "product",
    "name": "Olive oil",
    "category": "Food product",
    "description": "Olive oil is extracted from olives and used in cooking.",
    "related_equipment": "Olive oil press machine, stainless steel tank"
  },
  {
    "type": "equipment",
    "name": "Olive oil press machine",
    "category": "Food processing equipment",
    "description": "Machine used to extract oil from olives.",
    "city": "Tangier"
  }
]
```

### Cellule 8 — Lancer FastAPI

```python
!nohup uvicorn app.main:app --host 0.0.0.0 --port 8000 > api.log 2>&1 &
```

Vérifier les logs :

```python
!tail -n 20 api.log
```

### Cellule 9 — Ouvrir FastAPI dans le navigateur

```python
from google.colab.output import eval_js

url = eval_js("google.colab.kernel.proxyPort(8000)")
print(url)
```

Ouvrir le lien affiché.

Pour accéder à la documentation, ajouter :

```text
/docs
```

### Cellule 10 — Ingest les documents

Depuis le navigateur :

```text
POST /ingest
reset=true
```

Ou depuis Colab :

```python
!curl -X POST "http://localhost:8000/ingest?reset=true"
```

### Cellule 11 — Tester `/ask` depuis Colab

Si `/ask` est protégé par JWT, il faut un token :

```python
TOKEN = "PASTE_YOUR_JWT_TOKEN_HERE"
```

```python
!curl -X POST "http://localhost:8000/ask" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"question":"What equipment do I need for olive oil production?","k":4}'
```

Si `/ask` n’est pas encore protégé, tu peux tester sans le header Authorization.

---

## 21. Colab : lancer seulement Express Auth

C’est possible, mais MongoDB Atlas est nécessaire.

### Cellule 1

```python
%cd /content
!git clone YOUR_REPOSITORY_URL
%cd PFE/profood-auth-service
```

### Cellule 2

```python
!npm install
```

### Cellule 3 — Créer `.env`

```python
%%writefile .env
PORT=4000
MONGO_URI=mongodb+srv://USERNAME:PASSWORD@cluster0.xxxxx.mongodb.net/profood_auth?retryWrites=true&w=majority&appName=Cluster0
JWT_SECRET=change_this_secret_later_123
JWT_EXPIRES_IN=7d
```

### Cellule 4 — Lancer Express

```python
!nohup npm run dev > auth.log 2>&1 &
```

### Cellule 5 — Ouvrir Express

```python
from google.colab.output import eval_js
print(eval_js("google.colab.kernel.proxyPort(4000)"))
```

---

## 22. Colab : lancer Angular

C’est possible, mais ce n’est pas très recommandé dans Colab.

Pourquoi ?

```text
Angular dans ton navigateur va fonctionner via une URL proxy Colab.
Les API URLs comme http://localhost:4000 ne signifient pas la même chose côté navigateur.
Il faut remplacer les API_BASE URLs par les URLs proxy de Colab.
```

Si tu veux quand même tester :

```python
%cd /content/PFE/profood-auth-frontend
!npm install
```

Lancer Angular :

```python
!nohup npm start -- --host 0.0.0.0 --port 4200 > angular.log 2>&1 &
```

Récupérer l’URL :

```python
from google.colab.output import eval_js
print(eval_js("google.colab.kernel.proxyPort(4200)"))
```

Mais si le frontend appelle :

```text
http://localhost:4000
```

il faut le remplacer par l’URL proxy d’Express.

C’est pourquoi le mieux est :

```text
Colab pour le backend RAG seulement
PC local pour Angular + Express
```

---

# 23. Workflow développeur pour l’équipe

Chaque personne travaille sur sa propre branche :

```bash
git checkout main
git pull
git checkout -b feature/name-of-task
```

Exemples :

```bash
feature/auth-user-context
feature/rag-sessions-history
feature/data-ingestion-quality
feature/chatbot-ui-image-upload
```

Ensuite :

```bash
git add .
git commit -m "Describe changes"
git push origin feature/name-of-task
```

Puis créer une Pull Request depuis GitHub.

---

# 24. Répartition proposée des tâches dans l’équipe

```text
Personne 1 :
Intégration auth + identité utilisateur

Personne 2 :
Backend RAG + sessions/history

Personne 3 :
Nettoyage des données + qualité de l’ingestion

Personne 4 :
Frontend chatbot + base pour l’upload d’images
```

Objectif principal de la semaine :

```text
Utilisateur connecté
→ ouvre le chatbot
→ pose une question
→ le RAG répond à partir de données propres
→ les sources sont affichées
→ l’historique est sauvegardé par utilisateur/session
```

---

# 25. Architecture de production proposée

Dans l’entreprise, l’utilisateur sera déjà connecté. Il ne doit pas refaire un login pour le chatbot.

Le mieux :

```text
Company Frontend
  ↓
Company Backend
  ↓ envoie un user_id fiable
FastAPI RAG Microservice
  ↓
MongoDB pour l’historique du chat
Vector DB pour la base de connaissances
Ollama / LLM pour les réponses
```

L’Express Auth que nous avons créé :

```text
est seulement un prototype de test
ce n’est pas l’authentification de production
```

En production :

```text
Company Auth est la source de vérité
RAG reçoit un user_id fiable
RAG stocke les sessions/messages selon user_id
```

---

# 26. Checklist finale

Avant de dire que le projet fonctionne, vérifier :

```text
[ ] Express Auth API fonctionne sur http://localhost:4000
[ ] Angular fonctionne sur http://localhost:4200
[ ] FastAPI fonctionne sur http://127.0.0.1:8000
[ ] Ollama fonctionne sur http://localhost:11434
[ ] MongoDB Atlas connected
[ ] Register fonctionne
[ ] Login fonctionne
[ ] Le token est généré
[ ] Les documents existent dans data/pdfs
[ ] /ingest fonctionne
[ ] /ask retourne une réponse
[ ] Les sources s’affichent
[ ] .env n’a pas été poussé sur GitHub
```

---

# 27. Résumé rapide des commandes

## Express

```powershell
cd C:\Users\msi\Desktop\programation\PFE\profood-auth-service
npm install
npm run dev
```

## Angular

```powershell
cd C:\Users\msi\Desktop\programation\PFE\profood-auth-frontend
npm install
npm start
```

## FastAPI

```powershell
cd C:\Users\msi\Desktop\programation\PFE\profood-rag-ollama\profood-rag-ollama
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload
```

## Ollama

```powershell
ollama pull llama3.2
ollama pull nomic-embed-text
ollama list
```

## URLs du navigateur

```text
Angular Auth:
http://localhost:4200

Express API:
http://localhost:4000

FastAPI RAG:
http://127.0.0.1:8000

FastAPI Docs:
http://127.0.0.1:8000/docs
```

---

# 28. Note importante de sécurité

Ne pas mettre les secrets sur GitHub :

```text
MongoDB username/password
JWT_SECRET
fichiers .env
```

Si un secret a été poussé par erreur :

```text
1. Le changer immédiatement dans MongoDB Atlas
2. Le changer dans .env
3. Le retirer du tracking Git
```

Commande :

```bash
git rm --cached path/to/.env
```

---

## Fin

Si tu suis ces étapes dans l’ordre, tout le projet doit fonctionner dans le navigateur :

```text
Register/Login depuis Angular
API RAG depuis FastAPI
Ingestion des documents
Réponse IA depuis Ollama
MongoDB Atlas pour le stockage
```
