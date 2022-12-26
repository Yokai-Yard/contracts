const { ethers } = require('hardhat');

/**
 * Deploys the SnowCone V2 contract ecosystem.
 *
 * Example usage:
 *
 * npx hardhat deploy --network rinkeby --tag 1
 */
module.exports = async ({ deployments, getChainId }) => {
  console.log("Deploying 1");

  const { deploy } = deployments;
  const [deployer] = await ethers.getSigners();

  let multisigAddress;
  let chainlinkV2UsdEthPriceFeed;
  let chainId = await getChainId();
  let baseDeployArgs = {
    from: deployer.address,
    log: true,
    skipIfAlreadyDeployed: true,
  };
  let protocolProjectStartsAtOrAfter;

  console.log({ deployer: deployer.address, chain: chainId });

  switch (chainId) {
    case '31337':
      multisigAddress = deployer.address;
      chainlinkV2UsdEthPriceFeed = '0x0a77230d17318075983913bc2145db16c7366156';
      protocolProjectStartsAtOrAfter = 0;
      break;
    case '43113':
      multisigAddress = deployer.address;
      chainlinkV2UsdEthPriceFeed = '0x5498BB86BC934c8D34FDA08E81D444153d0D06aD';
      protocolProjectStartsAtOrAfter = 0;
      break;
  }

  console.log({ multisigAddress, protocolProjectStartsAtOrAfter });

  // Deploy a SNOWETHERC20ProjectPayerDeployer contract.
  await deploy('SNOWETHERC20ProjectPayerDeployer', {
    ...baseDeployArgs,
    args: [],
  });

  // Deploy a SNOWETHERC20SplitsPayerDeployer contract.
  await deploy('SNOWETHERC20SplitsPayerDeployer', {
    ...baseDeployArgs,
    contract: "contracts/SNOWETHERC20SplitsPayerDeployer.sol:SNOWETHERC20SplitsPayerDeployer",
    args: [],
  });

  // Deploy a SNOWOperatorStore contract.
  const SNOWOperatorStore = await deploy('SNOWOperatorStore', {
    ...baseDeployArgs,
    args: [],
  });

  // Deploy a SNOWPrices contract.
  const SNOWPrices = await deploy('SNOWPrices', {
    ...baseDeployArgs,
    args: [deployer.address],
  });

  // Deploy a SNOWProjects contract.
  const SNOWProjects = await deploy('SNOWProjects', {
    ...baseDeployArgs,
    args: [SNOWOperatorStore.address],
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
    contract: "contracts/SNOWFundingCycleStore.sol:SNOWFundingCycleStore",
    args: [SNOWDirectory.address],
  });

  // Deploy a SNOWTokenStore.
  const SNOWTokenStore = await deploy('SNOWTokenStore', {
    ...baseDeployArgs,
    args: [SNOWOperatorStore.address, SNOWProjects.address, SNOWDirectory.address],
  });

  // Deploy a SNOWSplitStore.
  const SNOWSplitStore = await deploy('SNOWSplitsStore', {
    ...baseDeployArgs,
    contract: "contracts/SNOWSplitsStore.sol:SNOWSplitsStore",
    args: [SNOWOperatorStore.address, SNOWProjects.address, SNOWDirectory.address],
  });

  // Deploy a SNOWController contract.
  const SNOWController = await deploy('SNOWController', {
    ...baseDeployArgs,
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
    contract: "contracts/SNOWSingleTokenPaymentTerminalStore.sol:SNOWSingleTokenPaymentTerminalStore",
    args: [SNOWDirectory.address, SNOWFundingCycleStore.address, SNOWPrices.address],
  });

  // Deploy the currencies library.
  const SNOWCurrencies = await deploy('SNOWCurrencies', {
    ...baseDeployArgs,
    args: [],
  });

  // Get references to contract that will have transactions triggered.
  const snowDirectoryContract = new ethers.Contract(SNOWDirectory.address, SNOWDirectory.abi);
  const snowPricesContract = new ethers.Contract(SNOWPrices.address, SNOWPrices.abi);
  const snowControllerContract = new ethers.Contract(SNOWController.address, SNOWController.abi);
  const snowProjects = new ethers.Contract(SNOWProjects.address, SNOWProjects.abi);
  const snowCurrenciesLibrary = new ethers.Contract(SNOWCurrencies.address, SNOWCurrencies.abi);

  // Get a reference to USD and AVAX currency indexes.
  const USD = await snowCurrenciesLibrary.connect(deployer).USD();
  const AVAX = await snowCurrenciesLibrary.connect(deployer).AVAX();

  // Deploy a SNOWETHPaymentTerminal contract.

  console.log(AVAX,
    SNOWOperatorStore.address,
    SNOWProjects.address,
    SNOWDirectory.address,
    SNOWSplitStore.address,
    SNOWPrices.address,
    SNOWSingleTokenPaymentTerminalStore.address,
    multisigAddress,)
  const SNOWETHPaymentTerminal = await deploy('SNOWETHPaymentTerminal', {
    ...baseDeployArgs,
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

  // Get a reference to an existing ETH/USD feed.
  const usdEthFeed = await snowPricesContract.connect(deployer).feedFor(USD, AVAX);

  // If needed, deploy an ETH/USD price feed and add it to the store.
  if (chainlinkV2UsdEthPriceFeed && usdEthFeed == ethers.constants.AddressZero) {
    // Deploy a SNOWChainlinkV3PriceFeed contract for ETH/USD.
    const SNOWChainlinkV3UsdEthPriceFeed = await deploy('SNOWChainlinkV3PriceFeed', {
      ...baseDeployArgs,
      args: [chainlinkV2UsdEthPriceFeed],
    });

    //The base currency is AVAX since the feed returns the USD price of 1 ETH.
    await snowPricesContract
      .connect(deployer)
      .addFeedFor(USD, AVAX, SNOWChainlinkV3UsdEthPriceFeed.address);
  }

  // If needed, transfer the ownership of the SNOWPrices to to the multisig.
  if ((await snowPricesContract.connect(deployer).owner()) != multisigAddress)
    await snowPricesContract.connect(deployer).transferOwnership(multisigAddress);

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

  // If needed, deploy the protocol project
  if ((await snowProjects.connect(deployer).count()) == 0) {
    console.log('Adding reserved token splits with current beneficiaries (as of deployment)');

    const beneficiaries = [
      '0x5502a9690499BDC32655a350bF9926A077Dc8161',
    ];

    let splits = [];

    beneficiaries.map((beneficiary) => {
      splits.push({
        preferClaimed: false,
        preferAddToBalance: false,
        percent: (1000000000 - 400000000) / beneficiaries.length, // 40% for SNOWDao
        projectId: 0,
        beneficiary: beneficiary,
        lockedUntil: 0,
        allocator: ethers.constants.AddressZero,
      });
    });

    splits.push({
      preferClaimed: false,
      preferAddToBalance: false,
      percent: 400000000, // 40% for SNOWDao
      projectId: 0,
      beneficiary: '0x5502a9690499BDC32655a350bF9926A077Dc8161',
      lockedUntil: 0,
      allocator: ethers.constants.AddressZero,
    });

    let groupedSplits = {
      group: 2,
      splits: splits,
    };

    // Deploy a SNOW3DayReconfigurationBufferBallot.
    const SNOW3DayReconfigurationBufferBallot = await deploy('SNOWReconfigurationBufferBallot', {
      ...baseDeployArgs,
      args: [259200, SNOWFundingCycleStore.address],
    });

    // Deploy a SNOW7DayReconfigurationBufferBallot.
    await deploy('SNOWReconfigurationBufferBallot', {
      ...baseDeployArgs,
      args: [604800, SNOWFundingCycleStore.address],
    });

    console.log('Deploying protocol project...');

    await snowControllerContract.connect(deployer).launchProjectFor(
      /*owner*/ multisigAddress,

      /* projectMetadata */
      [
        /*content*/ 'QmVft6EYEzDT7PnqPnn5p5BzxuqZHVzgEccJBRy224jUR8',
        /*domain*/ ethers.BigNumber.from(0),
      ],

      /*fundingCycleData*/
      [
        /*duration*/ ethers.BigNumber.from(1209600),
        /*weight*/ ethers.BigNumber.from('100863594919583409312000'),
        /*discountRate*/ ethers.BigNumber.from(100000000),
        /*ballot*/ SNOW3DayReconfigurationBufferBallot.address,
      ],

      /*fundingCycleMetadata*/
      [
        /*global*/
        [/*allowSetTerminals*/ false, /*allowSetController*/ false],
        /*reservedRate*/ ethers.BigNumber.from(5000),
        /*redemptionRate*/ ethers.BigNumber.from(9500),
        /*ballotRedemptionRate*/ ethers.BigNumber.from(9500),
        /*pausePay*/ false,
        /*pauseDistributions*/ false,
        /*pauseRedeem*/ false,
        /*pauseBurn*/ false,
        /*allowMinting*/ false,
        /*allowChangeToken*/ false,
        /*allowTerminalMigration*/ false,
        /*allowControllerMigration*/ false,
        /*holdFees*/ false,
        /*useTotalOverflowForRedemptions*/ false,
        /*useDataSourceForPay*/ false,
        /*useDataSourceForRedeem*/ false,
        /*dataSource*/ ethers.constants.AddressZero,
      ],

      /*mustStartAtOrAfter*/ ethers.BigNumber.from(protocolProjectStartsAtOrAfter),

      /*groupedSplits*/[groupedSplits],

      /*fundAccessConstraints*/[],

      /*terminals*/[SNOWETHPaymentTerminal.address],

      /*memo*/ '',
    );
  }

  console.log('Done');
};

module.exports.tags = ['1'];
