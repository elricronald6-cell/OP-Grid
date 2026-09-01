# OpGrid

On-chain mission dispatch platform for BOT Chain. Post missions with BOT token rewards, accept and complete missions with proof of work, approve to release payment.

## Setup

```bash
npm install
cp .env.example .env
# Add your deployer private key to .env
```

## Compile & Test

```bash
npx hardhat compile
npx hardhat test
```

## Deploy

```bash
# Testnet
npx hardhat run scripts/deploy.js --network botchain_testnet

# Mainnet
npx hardhat run scripts/deploy.js --network botchain_mainnet
```

After deploying, update `CONTRACT_ADDRESS` in `frontend/index.html` with the deployed address.

## Frontend

Open `frontend/index.html` directly or deploy to Vercel. The frontend connects to MetaMask and interacts with the OpGrid contract on BOT Chain.

## Contract Features

- Create missions with BOT token rewards
- Accept open missions as an operator
- Submit proof of completion
- Poster approves or rejects submissions
- Platform fee (3%) collected on completed missions
- Cancel open missions with full refund
- Owner can pause/unpause and withdraw fees
