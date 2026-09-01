const hre = require("hardhat");

async function main() {
  const platformFee = 300; // 3% in basis points

  console.log("Deploying OpGrid with platform fee:", platformFee, "basis points (3%)");

  const OpGrid = await hre.ethers.getContractFactory("OpGrid");
  const opGrid = await OpGrid.deploy(platformFee);
  await opGrid.waitForDeployment();

  const address = await opGrid.getAddress();
  console.log("OpGrid deployed to:", address);
  console.log("Network:", hre.network.name);
  console.log("\nUpdate CONTRACT_ADDRESS in frontend/index.html to:", address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
