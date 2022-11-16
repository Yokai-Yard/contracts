import { expect } from 'chai';
import { ethers } from 'hardhat';

import { deployMockContract } from '@ethereum-waffle/mock-contract';

import errors from '../helpers/errors.json';
import { packFundingCycleMetadata, impersonateAccount } from '../helpers/utils';

import snowController from '../../artifacts/contracts/interfaces/ISNOWController.sol/ISNOWController.json';
import snowDirectory from '../../artifacts/contracts/interfaces/ISNOWDirectory.sol/ISNOWDirectory.json';
import jBFundingCycleStore from '../../artifacts/contracts/interfaces/ISNOWFundingCycleStore.sol/ISNOWFundingCycleStore.json';
import snowPrices from '../../artifacts/contracts/interfaces/ISNOWPrices.sol/ISNOWPrices.json';
import snowProjects from '../../artifacts/contracts/interfaces/ISNOWProjects.sol/ISNOWProjects.json';
import snowTerminal from '../../artifacts/contracts/abstract/SNOWPayoutRedemptionPaymentTerminal.sol/SNOWPayoutRedemptionPaymentTerminal.json';
import snowTokenStore from '../../artifacts/contracts/interfaces/ISNOWTokenStore.sol/ISNOWTokenStore.json';

describe('SNOWSingleTokenPaymentTerminalStore::recordDistributionFor(...)', function () {
  const FUNDING_CYCLE_NUM = 1;
  const PROJECT_ID = 2;
  const AMOUNT = ethers.FixedNumber.fromString('4398541.345');
  const WEIGHT = ethers.FixedNumber.fromString('900000000.23411');
  const CURRENCY = 1;
  const _FIXED_POINT_MAX_FIDELITY = 18;

  async function setup() {
    const [deployer, addr] = await ethers.getSigners();

    const mockJbPrices = await deployMockContract(deployer, snowPrices.abi);
    const mockJbProjects = await deployMockContract(deployer, snowProjects.abi);
    const mockJbDirectory = await deployMockContract(deployer, snowDirectory.abi);
    const mockJbFundingCycleStore = await deployMockContract(deployer, jBFundingCycleStore.abi);
    const mockJbTerminal = await deployMockContract(deployer, snowTerminal.abi);
    const mockJbTokenStore = await deployMockContract(deployer, snowTokenStore.abi);
    const mockJbController = await deployMockContract(deployer, snowController.abi);

    const snowCurrenciesFactory = await ethers.getContractFactory('SNOWCurrencies');
    const snowCurrencies = await snowCurrenciesFactory.deploy();
    const CURRENCY_ETH = await snowCurrencies.ETH();
    const CURRENCY_USD = await snowCurrencies.USD();

    const SNOWPaymentTerminalStoreFactory = await ethers.getContractFactory(
      'contracts/SNOWSingleTokenPaymentTerminalStore.sol:SNOWSingleTokenPaymentTerminalStore',
    );
    const SNOWSingleTokenPaymentTerminalStore = await SNOWPaymentTerminalStoreFactory.deploy(
      mockJbDirectory.address,
      mockJbFundingCycleStore.address,
      mockJbPrices.address,
    );

    const blockNum = await ethers.provider.getBlockNumber();
    const block = await ethers.provider.getBlock(blockNum);
    const timestamp = block.timestamp;

    /* Common mocks */

    await mockJbTerminal.mock.currency.returns(CURRENCY);

    // Set controller address
    await mockJbDirectory.mock.controllerOf.withArgs(PROJECT_ID).returns(mockJbController.address);

    const mockJbTerminalSigner = await impersonateAccount(mockJbTerminal.address);

    const token = ethers.Wallet.createRandom().address;

    await mockJbTerminal.mock.token.returns(token);

    return {
      mockJbTerminal,
      mockJbTerminalSigner,
      addr,
      mockJbController,
      mockJbFundingCycleStore,
      mockJbPrices,
      SNOWSingleTokenPaymentTerminalStore,
      timestamp,
      token,
      CURRENCY_ETH,
      CURRENCY_USD,
    };
  }

  it('Should record distribution with mockJbTerminal access, if the amount in expressed in terminal currency', async function () {
    const {
      mockJbTerminal,
      mockJbTerminalSigner,
      mockJbController,
      mockJbFundingCycleStore,
      mockJbPrices,
      SNOWSingleTokenPaymentTerminalStore,
      timestamp,
      token,
      CURRENCY_USD,
    } = await setup();

    await mockJbFundingCycleStore.mock.currentOf.withArgs(PROJECT_ID).returns({
      // mock SNOWFundingCycle obj
      number: FUNDING_CYCLE_NUM,
      configuration: timestamp,
      basedOn: timestamp,
      start: timestamp,
      duration: 0,
      weight: WEIGHT,
      discountRate: 0,
      ballot: ethers.constants.AddressZero,
      metadata: packFundingCycleMetadata({ pauseDistributions: 0 }),
    });

    // Add to balance beforehand
    await SNOWSingleTokenPaymentTerminalStore.connect(mockJbTerminalSigner).recordAddedBalanceFor(
      PROJECT_ID,
      AMOUNT,
    );

    await mockJbController.mock.distributionLimitOf
      .withArgs(PROJECT_ID, timestamp, mockJbTerminal.address, token)
      .returns(AMOUNT, CURRENCY_USD);

    await mockJbTerminal.mock.currency.returns(CURRENCY_USD);

    // Pre-checks
    expect(
      await SNOWSingleTokenPaymentTerminalStore.usedDistributionLimitOf(
        mockJbTerminalSigner.address,
        PROJECT_ID,
        FUNDING_CYCLE_NUM,
      ),
    ).to.equal(0);
    expect(
      await SNOWSingleTokenPaymentTerminalStore.balanceOf(mockJbTerminalSigner.address, PROJECT_ID),
    ).to.equal(AMOUNT);

    // Record the distributions
    await SNOWSingleTokenPaymentTerminalStore.connect(mockJbTerminalSigner).recordDistributionFor(
      PROJECT_ID,
      AMOUNT,
      CURRENCY_USD,
    );

    // Post-checks
    expect(
      await SNOWSingleTokenPaymentTerminalStore.usedDistributionLimitOf(
        mockJbTerminalSigner.address,
        PROJECT_ID,
        FUNDING_CYCLE_NUM,
      ),
    ).to.equal(AMOUNT);
    expect(
      await SNOWSingleTokenPaymentTerminalStore.balanceOf(mockJbTerminalSigner.address, PROJECT_ID),
    ).to.equal(0);
  });

  it('Should record distribution with mockJbTerminal access, if the amount in another currency', async function () {
    const {
      mockJbTerminal,
      mockJbTerminalSigner,
      mockJbController,
      mockJbFundingCycleStore,
      mockJbPrices,
      SNOWSingleTokenPaymentTerminalStore,
      timestamp,
      token,
      CURRENCY_ETH,
      CURRENCY_USD,
    } = await setup();

    await mockJbFundingCycleStore.mock.currentOf.withArgs(PROJECT_ID).returns({
      // mock SNOWFundingCycle obj
      number: FUNDING_CYCLE_NUM,
      configuration: timestamp,
      basedOn: timestamp,
      start: timestamp,
      duration: 0,
      weight: WEIGHT,
      discountRate: 0,
      ballot: ethers.constants.AddressZero,
      metadata: packFundingCycleMetadata({ pauseDistributions: 0 }),
    });

    const usdToEthPrice = ethers.FixedNumber.from(10000);
    const amountInWei = AMOUNT.divUnsafe(usdToEthPrice);

    // Add to balance beforehand
    await SNOWSingleTokenPaymentTerminalStore.connect(mockJbTerminalSigner).recordAddedBalanceFor(
      PROJECT_ID,
      amountInWei,
    );

    await mockJbController.mock.distributionLimitOf
      .withArgs(PROJECT_ID, timestamp, mockJbTerminal.address, token)
      .returns(AMOUNT, CURRENCY_USD);

    await mockJbPrices.mock.priceFor
      .withArgs(CURRENCY_USD, CURRENCY_ETH, _FIXED_POINT_MAX_FIDELITY)
      .returns(usdToEthPrice);

    await mockJbTerminal.mock.currency.returns(CURRENCY_ETH);

    // Pre-checks
    expect(
      await SNOWSingleTokenPaymentTerminalStore.usedDistributionLimitOf(
        mockJbTerminalSigner.address,
        PROJECT_ID,
        FUNDING_CYCLE_NUM,
      ),
    ).to.equal(0);
    expect(
      await SNOWSingleTokenPaymentTerminalStore.balanceOf(mockJbTerminalSigner.address, PROJECT_ID),
    ).to.equal(amountInWei);

    // Record the distributions
    await SNOWSingleTokenPaymentTerminalStore.connect(mockJbTerminalSigner).recordDistributionFor(
      PROJECT_ID,
      AMOUNT,
      CURRENCY_USD,
    );

    // Post-checks
    expect(
      await SNOWSingleTokenPaymentTerminalStore.usedDistributionLimitOf(
        mockJbTerminalSigner.address,
        PROJECT_ID,
        FUNDING_CYCLE_NUM,
      ),
    ).to.equal(AMOUNT);
    expect(
      await SNOWSingleTokenPaymentTerminalStore.balanceOf(mockJbTerminalSigner.address, PROJECT_ID),
    ).to.equal(0);
  });

  /* Sad path tests */

  it(`Can't record distribution if distributions are paused`, async function () {
    const {
      mockJbTerminal,
      mockJbTerminalSigner,
      mockJbFundingCycleStore,
      SNOWSingleTokenPaymentTerminalStore,
      timestamp,
      CURRENCY_ETH,
    } = await setup();

    await mockJbFundingCycleStore.mock.currentOf.withArgs(PROJECT_ID).returns({
      // mock SNOWFundingCycle obj
      number: FUNDING_CYCLE_NUM,
      configuration: timestamp,
      basedOn: timestamp,
      start: timestamp,
      duration: 0,
      weight: WEIGHT,
      discountRate: 0,
      ballot: ethers.constants.AddressZero,
      metadata: packFundingCycleMetadata({ pauseDistributions: 1 }),
    });

    await mockJbTerminal.mock.currency.returns(CURRENCY_ETH);

    // Record the distributions
    await expect(
      SNOWSingleTokenPaymentTerminalStore.connect(mockJbTerminalSigner).recordDistributionFor(
        PROJECT_ID,
        AMOUNT,
        CURRENCY_ETH,
      ),
    ).to.be.revertedWith(errors.FUNDING_CYCLE_DISTRIBUTION_PAUSED);
  });

  it(`Can't record distribution if currency param doesn't match controller's currency`, async function () {
    const {
      mockJbTerminal,
      mockJbTerminalSigner,
      mockJbController,
      mockJbFundingCycleStore,
      SNOWSingleTokenPaymentTerminalStore,
      timestamp,
      token,
      CURRENCY_ETH,
      CURRENCY_USD,
    } = await setup();

    await mockJbFundingCycleStore.mock.currentOf.withArgs(PROJECT_ID).returns({
      // mock SNOWFundingCycle obj
      number: FUNDING_CYCLE_NUM,
      configuration: timestamp,
      basedOn: timestamp,
      start: timestamp,
      duration: 0,
      weight: WEIGHT,
      discountRate: 0,
      ballot: ethers.constants.AddressZero,
      metadata: packFundingCycleMetadata({ pauseDistributions: 0 }),
    });

    await mockJbController.mock.distributionLimitOf
      .withArgs(PROJECT_ID, timestamp, mockJbTerminal.address, token)
      .returns(AMOUNT, CURRENCY_USD);

    await mockJbTerminal.mock.currency.returns(CURRENCY_ETH);

    // Record the distributions
    await expect(
      SNOWSingleTokenPaymentTerminalStore.connect(mockJbTerminalSigner).recordDistributionFor(
        PROJECT_ID,
        AMOUNT,
        CURRENCY_ETH,
      ), // Use ETH instead of expected USD
    ).to.be.revertedWith(errors.CURRENCY_MISMATCH);
  });

  it(`Can't record distribution if distributionLimit is exceeded`, async function () {
    const {
      mockJbTerminal,
      mockJbTerminalSigner,
      mockJbController,
      mockJbFundingCycleStore,
      mockJbPrices,
      SNOWSingleTokenPaymentTerminalStore,
      timestamp,
      token,
      CURRENCY_ETH,
    } = await setup();

    await mockJbFundingCycleStore.mock.currentOf.withArgs(PROJECT_ID).returns({
      // mock SNOWFundingCycle obj
      number: FUNDING_CYCLE_NUM,
      configuration: timestamp,
      basedOn: timestamp,
      start: timestamp,
      duration: 0,
      weight: WEIGHT,
      discountRate: 0,
      ballot: ethers.constants.AddressZero,
      metadata: packFundingCycleMetadata({ pauseDistributions: 0 }),
    });

    // Add to balance beforehand
    await SNOWSingleTokenPaymentTerminalStore.connect(mockJbTerminalSigner).recordAddedBalanceFor(
      PROJECT_ID,
      AMOUNT,
    );

    const smallDistributionLimit = AMOUNT.subUnsafe(ethers.FixedNumber.from(1));
    await mockJbController.mock.distributionLimitOf
      .withArgs(PROJECT_ID, timestamp, mockJbTerminal.address, token)
      .returns(smallDistributionLimit, CURRENCY_ETH); // Set intentionally small distribution limit

    await mockJbTerminal.mock.currency.returns(CURRENCY_ETH);

    // Record the distributions
    await expect(
      SNOWSingleTokenPaymentTerminalStore.connect(mockJbTerminalSigner).recordDistributionFor(
        PROJECT_ID,
        AMOUNT,
        CURRENCY_ETH,
      ),
    ).to.be.revertedWith(errors.DISTRIBUTION_AMOUNT_LIMIT_REACHED);
  });

  it(`Can't record distribution if distributionLimit is 0`, async function () {
    const {
      mockJbTerminal,
      mockJbTerminalSigner,
      mockJbController,
      mockJbFundingCycleStore,
      mockJbPrices,
      SNOWSingleTokenPaymentTerminalStore,
      timestamp,
      token,
      CURRENCY_ETH,
    } = await setup();

    await mockJbFundingCycleStore.mock.currentOf.withArgs(PROJECT_ID).returns({
      // mock SNOWFundingCycle obj
      number: FUNDING_CYCLE_NUM,
      configuration: timestamp,
      basedOn: timestamp,
      start: timestamp,
      duration: 0,
      weight: WEIGHT,
      discountRate: 0,
      ballot: ethers.constants.AddressZero,
      metadata: packFundingCycleMetadata({ pauseDistributions: 0 }),
    });

    // Add to balance beforehand
    await SNOWSingleTokenPaymentTerminalStore.connect(mockJbTerminalSigner).recordAddedBalanceFor(
      PROJECT_ID,
      AMOUNT,
    );

    await mockJbController.mock.distributionLimitOf
      .withArgs(PROJECT_ID, timestamp, mockJbTerminal.address, token)
      .returns(0, CURRENCY_ETH);

    await mockJbTerminal.mock.currency.returns(CURRENCY_ETH);

    // Record the distributions
    await expect(
      SNOWSingleTokenPaymentTerminalStore.connect(mockJbTerminalSigner).recordDistributionFor(
        PROJECT_ID,
        0,
        CURRENCY_ETH,
      ),
    ).to.be.revertedWith(errors.DISTRIBUTION_AMOUNT_LIMIT_REACHED);
  });

  it(`Can't record distribution if distributedAmount > project's total balance`, async function () {
    const {
      mockJbTerminal,
      mockJbTerminalSigner,
      mockJbController,
      mockJbFundingCycleStore,
      mockJbPrices,
      SNOWSingleTokenPaymentTerminalStore,
      timestamp,
      token,
      CURRENCY_ETH,
    } = await setup();

    await mockJbFundingCycleStore.mock.currentOf.withArgs(PROJECT_ID).returns({
      // mock SNOWFundingCycle obj
      number: FUNDING_CYCLE_NUM,
      configuration: timestamp,
      basedOn: timestamp,
      start: timestamp,
      duration: 0,
      weight: WEIGHT,
      discountRate: 0,
      ballot: ethers.constants.AddressZero,
      metadata: packFundingCycleMetadata({ pauseDistributions: 0 }),
    });

    // Add intentionally small balance
    const smallBalance = AMOUNT.subUnsafe(ethers.FixedNumber.from(1));
    await SNOWSingleTokenPaymentTerminalStore.connect(mockJbTerminalSigner).recordAddedBalanceFor(
      PROJECT_ID,
      smallBalance,
    );

    await mockJbController.mock.distributionLimitOf
      .withArgs(PROJECT_ID, timestamp, mockJbTerminal.address, token)
      .returns(AMOUNT, CURRENCY_ETH);

    await mockJbTerminal.mock.currency.returns(CURRENCY_ETH);

    // Record the distributions
    await expect(
      SNOWSingleTokenPaymentTerminalStore.connect(mockJbTerminalSigner).recordDistributionFor(
        PROJECT_ID,
        AMOUNT,
        CURRENCY_ETH,
      ),
    ).to.be.revertedWith(errors.INADEQUATE_PAYMENT_TERMINAL_STORE_BALANCE);
  });
});
