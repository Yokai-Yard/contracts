const { ethers } = require('hardhat');

/**
 * Deploys a second version of many contracts for projects to migrate onto as a consequence of https://github.com/snowx-protocol/juice-contracts-v2/pull/268.
 *
 * Example usage:
 *
 * npx hardhat deploy --network rinkeby --tag 2
 */
module.exports = async ({ deployments, getChainId }) => {
  console.log("Deploying 2");

  const { deploy } = deployments;
  const [deployer] = await ethers.getSigners();

  let multisigAddress;
  let chainId = await getChainId();
  let baseDeployArgs = {
    from: deployer.address,
    log: true,
    skipIfAlreadyDeployed: true,
  };

  console.log({ deployer: deployer.address, chain: chainId });

  switch (chainId) {

    case '31337':
      multisigAddress = deployer.address;
      break;
    case '43113':
      multisigAddress = deployer.address;
      break;
  }

  console.log({ multisigAddress });

  // Reuse the SNOWOperatorStore contract.
  const SNOWOperatorStore = await deploy('SNOWOperatorStore', {
    ...baseDeployArgs,
    args: [],
  });

  // Reuse the SNOWPrices contract.
  const SNOWPrices = await deploy('SNOWPrices', {
    ...baseDeployArgs,
    args: [deployer.address],
  });

  // Reuse the SNOWProjects contract.
  const SNOWProjects = await deploy('SNOWProjects', {
    ...baseDeployArgs,
    args: [SNOWOperatorStore.address],
  });

  // Reuse the currencies library.
  const SNOWCurrencies = await deploy('SNOWCurrencies', {
    ...baseDeployArgs,
    args: [],
  });

  // Get the future address of SNOWFundingCycleStore
  const transactionCount = await deployer.getTransactionCount();

  const FundingCycleStoreFutureAddress = ethers.utils.getContractAddress({
    from: deployer.address,
    nonce: transactionCount + 1,
  });

  // Deploy a SNOWDirectory.
  const SNOWDirectory = await deploy('SNOWDirectory', {
    ...baseDeployArgs,
    skipIfAlreadyDeployed: false,
    contract: "contracts/SNOWDirectory.sol:SNOWDirectory",
    args: [
      SNOWOperatorStore.address,
      SNOWProjects.address,
      FundingCycleStoreFutureAddress,
      deployer.address,
    ],
  });

  // Deploy a SNOWFundingCycleStore.
  const SNOWFundingCycleStore = await deploy('SNOWFundingCycleStore', {
    ...baseDeployArgs,
    skipIfAlreadyDeployed: false,
    contract: "contracts/SNOWFundingCycleStore.sol:SNOWFundingCycleStore",
    args: [SNOWDirectory.address],
  });

  // Deploy a SNOW3DayReconfigurationBufferBallot.
  await deploy('SNOW3DayReconfigurationBufferBallot', {
    ...baseDeployArgs,
    skipIfAlreadyDeployed: false,
    contract: "contracts/SNOWReconfigurationBufferBallot.sol:SNOWReconfigurationBufferBallot",
    args: [259200, SNOWFundingCycleStore.address],
  });

  // Deploy a SNOW7DayReconfigurationBufferBallot.
  await deploy('SNOW7DayReconfigurationBufferBallot', {
    ...baseDeployArgs,
    skipIfAlreadyDeployed: false,
    contract: "contracts/SNOWReconfigurationBufferBallot.sol:SNOWReconfigurationBufferBallot",
    args: [604800, SNOWFundingCycleStore.address],
  });

  // Deploy a SNOWTokenStore.
  const SNOWTokenStore = await deploy('SNOWTokenStore', {
    ...baseDeployArgs,
    skipIfAlreadyDeployed: false,
    contract: "contracts/SNOWTokenStore.sol:SNOWTokenStore",
    args: [SNOWOperatorStore.address, SNOWProjects.address, SNOWDirectory.address],
  });

  // Deploy a SNOWSplitStore.
  const SNOWSplitStore = await deploy('SNOWSplitsStore', {
    ...baseDeployArgs,
    skipIfAlreadyDeployed: false,
    contract: "contracts/SNOWSplitsStore.sol:SNOWSplitsStore",
    args: [SNOWOperatorStore.address, SNOWProjects.address, SNOWDirectory.address],
  });

  // Deploy a SNOWETHERC20SplitsPayerDeployer contract.
  await deploy('SNOWETHERC20SplitsPayerDeployer', {
    ...baseDeployArgs,
    skipIfAlreadyDeployed: false,
    contract: "contracts/SNOWETHERC20SplitsPayerDeployer.sol:SNOWETHERC20SplitsPayerDeployer",
    args: [],
  });

  // Deploy a SNOWController contract.
  const SNOWController = await deploy('SNOWController', {
    ...baseDeployArgs,
    skipIfAlreadyDeployed: false,
    contract: "contracts/SNOWController.sol:SNOWController",
    args: [
      SNOWOperatorStore.address,
      SNOWProjects.address,
      SNOWDirectory.address,
      SNOWFundingCycleStore.address,
      SNOWTokenStore.address,
      SNOWSplitStore.address,
    ],
  });

  // Deploy a SNOWSingleTokenPaymentTerminalStore contract.
  const SNOWSingleTokenPaymentTerminalStore = await deploy('SNOWSingleTokenPaymentTerminalStore', {
    ...baseDeployArgs,
    skipIfAlreadyDeployed: false,
    contract: "contracts/SNOWSingleTokenPaymentTerminalStore.sol:SNOWSingleTokenPaymentTerminalStore",
    args: [SNOWDirectory.address, SNOWFundingCycleStore.address, SNOWPrices.address],
  });

  // Get references to contract that will have transactions triggered.
  const snowDirectoryContract = new ethers.Contract(SNOWDirectory.address, SNOWDirectory.abi);
  const snowCurrenciesLibrary = new ethers.Contract(SNOWCurrencies.address, SNOWCurrencies.abi);

  // Get a reference to USD and AVAX currency indexes.
  const AVAX = await snowCurrenciesLibrary.connect(deployer).AVAX();

  // Deploy a SNOWETHPaymentTerminal contract.
  await deploy('SNOWETHPaymentTerminal', {
    ...baseDeployArgs,
    skipIfAlreadyDeployed: false,
    contract: "contracts/SNOWETHPaymentTerminal.sol:SNOWETHPaymentTerminal",
    args: [
      AVAX,
      SNOWOperatorStore.address,
      SNOWProjects.address,
      SNOWDirectory.address,
      SNOWSplitStore.address,
      SNOWPrices.address,
      SNOWSingleTokenPaymentTerminalStore.address,
      multisigAddress,
    ],
  });

  let isAllowedToSetFirstController = await snowDirectoryContract
    .connect(deployer)
    .isAllowedToSetFirstController(SNOWController.address);

  console.log({ isAllowedToSetFirstController });

  // If needed, allow the controller to set projects' first controller, then transfer the ownership of the SNOWDirectory to the multisig.
  if (!isAllowedToSetFirstController) {
    let tx = await snowDirectoryContract
      .connect(deployer)
      .setIsAllowedToSetFirstController(SNOWController.address, true);
    await tx.wait();
  }

  // If needed, transfer the ownership of the SNOWDirectory contract to the multisig.
  if ((await snowDirectoryContract.connect(deployer).owner()) != multisigAddress)
    await snowDirectoryContract.connect(deployer).transferOwnership(multisigAddress);

  console.log('Done');
};

module.exports.tags = ['2'];
module.exports.dependencies = ['1']; 