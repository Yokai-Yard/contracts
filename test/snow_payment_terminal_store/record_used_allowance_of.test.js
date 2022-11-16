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

describe('SNOWSingleTokenPaymentTerminalStore::recordUsedAllowanceOf(...)', function () {
  const PROJECT_ID = 2;
  const AMOUNT = ethers.BigNumber.from('43985411231');
  const WEIGHT = ethers.BigNumber.from('900000000');
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
    const _FIXED_POINT_MAX_FIDELITY = 18;

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

    await mockJbTerminal.mock.currency.returns(CURRENCY_USD);
    await mockJbTerminal.mock.baseWeightCurrency.returns(CURRENCY_ETH);

    // Set controller address
    await mockJbDirectory.mock.controllerOf.withArgs(PROJECT_ID).returns(mockJbController.address);

    const packedMetadata = packFundingCycleMetadata();
    await mockJbFundingCycleStore.mock.currentOf.withArgs(PROJECT_ID).returns({
      number: 1,
      configuration: timestamp,
      basedOn: timestamp,
      start: timestamp,
      duration: 0,
      weight: WEIGHT,
      discountRate: 0,
      ballot: ethers.constants.AddressZero,
      metadata: packedMetadata,
    });

    const mockJbTerminalSigner = await impersonateAccount(mockJbTerminal.address);

    const token = ethers.Wallet.createRandom().address;
    await mockJbTerminal.mock.token.returns(token);

    return {
      addr,
      mockJbController,
      mockJbPrices,
      mockJbTerminal,
      mockJbTerminalSigner,
      SNOWSingleTokenPaymentTerminalStore,
      timestamp,
      token,
      CURRENCY_ETH,
      CURRENCY_USD,
    };
  }

  it('Should record used allowance with terminal access', async function () {
    const {
      mockJbController,
      mockJbPrices,
      mockJbTerminal,
      mockJbTerminalSigner,
      SNOWSingleTokenPaymentTerminalStore,
      timestamp,
      token,
      CURRENCY_ETH, // base weight currency
      CURRENCY_USD, // terminal currency
    } = await setup();

    // Add to balance beforehand, in USD
    await SNOWSingleTokenPaymentTerminalStore.connect(mockJbTerminalSigner).recordAddedBalanceFor(
      PROJECT_ID,
      AMOUNT,
    );

    // Both limit and allowance in USD
    await mockJbController.mock.distributionLimitOf
      .withArgs(PROJECT_ID, timestamp, mockJbTerminal.address, token)
      .returns(0, CURRENCY_USD);

    await mockJbController.mock.overflowAllowanceOf
      .withArgs(PROJECT_ID, timestamp, mockJbTerminal.address, token)
      .returns(AMOUNT, CURRENCY_USD);

    await mockJbTerminal.mock.currency.returns(CURRENCY_USD);

    // Pre-checks
    expect(
      await SNOWSingleTokenPaymentTerminalStore.usedOverflowAllowanceOf(
        mockJbTerminalSigner.address,
        PROJECT_ID,
        timestamp,
      ),
    ).to.equal(0);
    expect(
      await SNOWSingleTokenPaymentTerminalStore.balanceOf(mockJbTerminalSigner.address, PROJECT_ID),
    ).to.equal(AMOUNT); // balanceOf is in terminal currency (USD)

    // Record the used allowance
    await SNOWSingleTokenPaymentTerminalStore.connect(mockJbTerminalSigner).recordUsedAllowanceOf(
      PROJECT_ID,
      AMOUNT,
      CURRENCY_USD,
    );

    // Post-checks
    expect(
      await SNOWSingleTokenPaymentTerminalStore.usedOverflowAllowanceOf(
        mockJbTerminalSigner.address,
        PROJECT_ID,
        timestamp,
      ),
    ).to.equal(AMOUNT);
    expect(
      await SNOWSingleTokenPaymentTerminalStore.balanceOf(mockJbTerminalSigner.address, PROJECT_ID),
    ).to.equal(0); // AMOUNT-AMOUNT = 0
  });
  it('Should record used allowance with > 0 distribution limit', async function () {
    const {
      mockJbController,
      mockJbPrices,
      mockJbTerminal,
      mockJbTerminalSigner,
      SNOWSingleTokenPaymentTerminalStore,
      timestamp,
      token,
      CURRENCY_ETH, // base weight currency
      CURRENCY_USD, // terminal currency
    } = await setup();

    const usdToEthPrice = ethers.BigNumber.from(3500);

    // Add to balance beforehand, in USD
    await SNOWSingleTokenPaymentTerminalStore.connect(mockJbTerminalSigner).recordAddedBalanceFor(
      PROJECT_ID,
      AMOUNT,
    );

    const distributionLimit = AMOUNT - 1;

    // Both limit and allowance in USD
    await mockJbController.mock.distributionLimitOf
      .withArgs(PROJECT_ID, timestamp, mockJbTerminal.address, token)
      .returns(distributionLimit, CURRENCY_USD);

    await mockJbController.mock.overflowAllowanceOf
      .withArgs(PROJECT_ID, timestamp, mockJbTerminal.address, token)
      .returns(AMOUNT, CURRENCY_USD);

    await mockJbTerminal.mock.currency.returns(CURRENCY_USD);

    // Pre-checks
    expect(
      await SNOWSingleTokenPaymentTerminalStore.usedOverflowAllowanceOf(
        mockJbTerminalSigner.address,
        PROJECT_ID,
        timestamp,
      ),
    ).to.equal(0);
    expect(
      await SNOWSingleTokenPaymentTerminalStore.balanceOf(mockJbTerminalSigner.address, PROJECT_ID),
    ).to.equal(AMOUNT); // balanceOf is in terminal currency (USD)

    // Record the used allowance
    await SNOWSingleTokenPaymentTerminalStore.connect(mockJbTerminalSigner).recordUsedAllowanceOf(
      PROJECT_ID,
      AMOUNT - distributionLimit,
      CURRENCY_USD,
    );

    // Post-checks
    expect(
      await SNOWSingleTokenPaymentTerminalStore.usedOverflowAllowanceOf(
        mockJbTerminalSigner.address,
        PROJECT_ID,
        timestamp,
      ),
    ).to.equal(AMOUNT - distributionLimit);
    expect(
      await SNOWSingleTokenPaymentTerminalStore.balanceOf(mockJbTerminalSigner.address, PROJECT_ID),
    ).to.equal(distributionLimit);
  });
  it('Should record used allowance with > 0 distribution limit and different distribution currency', async function () {
    const {
      mockJbController,
      mockJbPrices,
      mockJbTerminal,
      mockJbTerminalSigner,
      SNOWSingleTokenPaymentTerminalStore,
      timestamp,
      token,
      CURRENCY_ETH, // base weight currency
      CURRENCY_USD, // terminal currency
    } = await setup();

    const ethToUsdPrice = ethers.BigNumber.from(2).mul(
      ethers.BigNumber.from(10).pow(_FIXED_POINT_MAX_FIDELITY),
    );

    const distributionLimit = ethers.BigNumber.from(10).pow(18);

    const amountToUse = 2345678; // in eth
    let amountToUseInDollar =
      amountToUse / ethToUsdPrice.div(ethers.BigNumber.from(10).pow(_FIXED_POINT_MAX_FIDELITY));

    // Add to balance beforehand, in USD
    await SNOWSingleTokenPaymentTerminalStore.connect(mockJbTerminalSigner).recordAddedBalanceFor(
      PROJECT_ID,
      distributionLimit.add(amountToUseInDollar),
    );

    await mockJbController.mock.distributionLimitOf
      .withArgs(PROJECT_ID, timestamp, mockJbTerminal.address, token)
      .returns(distributionLimit, CURRENCY_USD); // in usd

    await mockJbController.mock.overflowAllowanceOf
      .withArgs(PROJECT_ID, timestamp, mockJbTerminal.address, token)
      .returns(amountToUse, CURRENCY_ETH); // in eth

    await mockJbPrices.mock.priceFor
      .withArgs(CURRENCY_ETH, CURRENCY_USD, _FIXED_POINT_MAX_FIDELITY)
      .returns(ethToUsdPrice);

    await mockJbTerminal.mock.currency.returns(CURRENCY_USD);

    // Pre-checks
    expect(
      await SNOWSingleTokenPaymentTerminalStore.usedOverflowAllowanceOf(
        mockJbTerminalSigner.address,
        PROJECT_ID,
        timestamp,
      ),
    ).to.equal(0);
    expect(
      await SNOWSingleTokenPaymentTerminalStore.balanceOf(mockJbTerminalSigner.address, PROJECT_ID),
    ).to.equal(distributionLimit.add(amountToUseInDollar)); // balanceOf is in terminal currency (USD)

    // Record the used allowance
    await SNOWSingleTokenPaymentTerminalStore.connect(mockJbTerminalSigner).recordUsedAllowanceOf(
      PROJECT_ID,
      amountToUse,
      CURRENCY_ETH,
    );

    // Post-checks
    expect(
      await SNOWSingleTokenPaymentTerminalStore.usedOverflowAllowanceOf(
        mockJbTerminalSigner.address,
        PROJECT_ID,
        timestamp,
      ),
    ).to.equal(amountToUse); // in usd

    expect(
      await SNOWSingleTokenPaymentTerminalStore.balanceOf(mockJbTerminalSigner.address, PROJECT_ID),
    ).to.equal(distributionLimit); // in usd
  });

  /* Sad path tests */

  it(`Can't record allowance if currency param doesn't match controller's currency`, async function () {
    const {
      mockJbController,
      mockJbTerminal,
      mockJbTerminalSigner,
      SNOWSingleTokenPaymentTerminalStore,
      timestamp,
      token,
      CURRENCY_ETH,
      CURRENCY_USD,
    } = await setup();

    await mockJbController.mock.overflowAllowanceOf
      .withArgs(PROJECT_ID, timestamp, mockJbTerminal.address, token)
      .returns(AMOUNT, CURRENCY_USD);

    await mockJbTerminal.mock.currency.returns(CURRENCY_ETH);

    // Record the used allowance
    await expect(
      SNOWSingleTokenPaymentTerminalStore.connect(mockJbTerminalSigner).recordUsedAllowanceOf(
        PROJECT_ID,
        AMOUNT,
        CURRENCY_ETH,
      ),
    ).to.be.revertedWith(errors.CURRENCY_MISMATCH);
  });

  it(`Can't record allowance if controller's overflowAllowanceOf is exceeded`, async function () {
    const {
      mockJbController,
      mockJbTerminal,
      mockJbTerminalSigner,
      SNOWSingleTokenPaymentTerminalStore,
      timestamp,
      token,
      CURRENCY_USD,
    } = await setup();

    // Add to balance beforehand
    await SNOWSingleTokenPaymentTerminalStore.connect(mockJbTerminalSigner).recordAddedBalanceFor(
      PROJECT_ID,
      AMOUNT,
    );

    const smallTotalAllowance = AMOUNT.sub(ethers.BigNumber.from(1));
    await mockJbController.mock.overflowAllowanceOf
      .withArgs(PROJECT_ID, timestamp, mockJbTerminal.address, token)
      .returns(smallTotalAllowance, CURRENCY_USD); // Set the controller's overflowAllowance to something small

    await mockJbTerminal.mock.currency.returns(CURRENCY_USD);

    // Record the used allowance
    await expect(
      SNOWSingleTokenPaymentTerminalStore.connect(mockJbTerminalSigner).recordUsedAllowanceOf(
        PROJECT_ID,
        AMOUNT,
        CURRENCY_USD,
      ),
    ).to.be.revertedWith(errors.INADEQUATE_CONTROLLER_ALLOWANCE);
  });

  it(`Can't record allowance if controller's overflowAllowanceOf is 0`, async function () {
    const {
      mockJbController,
      mockJbTerminal,
      mockJbTerminalSigner,
      SNOWSingleTokenPaymentTerminalStore,
      timestamp,
      token,
      CURRENCY_USD,
    } = await setup();

    // Add to balance beforehand
    await SNOWSingleTokenPaymentTerminalStore.connect(mockJbTerminalSigner).recordAddedBalanceFor(
      PROJECT_ID,
      AMOUNT,
    );

    await mockJbController.mock.overflowAllowanceOf
      .withArgs(PROJECT_ID, timestamp, mockJbTerminal.address, token)
      .returns(0, CURRENCY_USD); // Set the controller's overflowAllowance to something small

    await mockJbTerminal.mock.currency.returns(CURRENCY_USD);

    // Record the used allowance
    await expect(
      SNOWSingleTokenPaymentTerminalStore.connect(mockJbTerminalSigner).recordUsedAllowanceOf(
        PROJECT_ID,
        0,
        CURRENCY_USD,
      ),
    ).to.be.revertedWith(errors.INADEQUATE_CONTROLLER_ALLOWANCE);
  });

  it(`Can't record allowance if _leftToDistribute > balanceOf`, async function () {
    const {
      mockJbController,
      mockJbTerminal,
      mockJbTerminalSigner,
      SNOWSingleTokenPaymentTerminalStore,
      timestamp,
      token,
      CURRENCY_USD,
    } = await setup();

    // Create a big overflow
    await mockJbController.mock.distributionLimitOf
      .withArgs(PROJECT_ID, timestamp, mockJbTerminal.address, token)
      .returns(AMOUNT, CURRENCY_USD);

    await mockJbController.mock.overflowAllowanceOf
      .withArgs(PROJECT_ID, timestamp, mockJbTerminal.address, token)
      .returns(AMOUNT, CURRENCY_USD);

    await mockJbTerminal.mock.currency.returns(CURRENCY_USD);

    // Note: We didn't add an initial balance to the store
    // Record the used allowance
    await expect(
      SNOWSingleTokenPaymentTerminalStore.connect(mockJbTerminalSigner).recordUsedAllowanceOf(
        PROJECT_ID,
        AMOUNT,
        CURRENCY_USD,
      ),
    ).to.be.revertedWith(errors.INADEQUATE_PAYMENT_TERMINAL_STORE_BALANCE);
  });

  it(`Can't record allowance if withdrawnAmount > overflow`, async function () {
    const {
      mockJbController,
      mockJbPrices,
      mockJbTerminal,
      mockJbTerminalSigner,
      SNOWSingleTokenPaymentTerminalStore,
      timestamp,
      token,
      CURRENCY_ETH,
      CURRENCY_USD,
    } = await setup();

    // Add to balance beforehand
    const smallBalance = AMOUNT.sub(ethers.BigNumber.from(1));

    await SNOWSingleTokenPaymentTerminalStore.connect(mockJbTerminalSigner).recordAddedBalanceFor(
      PROJECT_ID,
      AMOUNT,
    );

    // Leave a small overflow
    await mockJbController.mock.distributionLimitOf
      .withArgs(PROJECT_ID, timestamp, mockJbTerminal.address, token)
      .returns(smallBalance, CURRENCY_ETH);

    await mockJbController.mock.overflowAllowanceOf
      .withArgs(PROJECT_ID, timestamp, mockJbTerminal.address, token)
      .returns(AMOUNT, CURRENCY_ETH);

    await mockJbPrices.mock.priceFor
      .withArgs(CURRENCY_ETH, CURRENCY_USD, _FIXED_POINT_MAX_FIDELITY)
      .returns(ethers.BigNumber.from(1));

    await mockJbTerminal.mock.currency.returns(CURRENCY_USD);

    // Record the used allowance
    await expect(
      SNOWSingleTokenPaymentTerminalStore.connect(mockJbTerminalSigner).recordUsedAllowanceOf(
        PROJECT_ID,
        AMOUNT,
        CURRENCY_ETH,
      ),
    ).to.be.revertedWith(errors.INADEQUATE_PAYMENT_TERMINAL_STORE_BALANCE);
  });
  it(`Can't record used allowance with > 0 distribution limit and not enough balance outside of this limit`, async function () {
    const {
      mockJbController,
      mockJbPrices,
      mockJbTerminal,
      mockJbTerminalSigner,
      SNOWSingleTokenPaymentTerminalStore,
      timestamp,
      token,
      CURRENCY_ETH, // base weight currency
      CURRENCY_USD, // terminal currency
    } = await setup();

    const usdToEthPrice = ethers.BigNumber.from(3500);

    // Add to balance beforehand, in USD
    await SNOWSingleTokenPaymentTerminalStore.connect(mockJbTerminalSigner).recordAddedBalanceFor(
      PROJECT_ID,
      AMOUNT,
    );

    const distributionLimit = AMOUNT;

    // Both limit and allowance in USD
    await mockJbController.mock.distributionLimitOf
      .withArgs(PROJECT_ID, timestamp, mockJbTerminal.address, token)
      .returns(distributionLimit, CURRENCY_USD);

    await mockJbController.mock.overflowAllowanceOf
      .withArgs(PROJECT_ID, timestamp, mockJbTerminal.address, token)
      .returns(AMOUNT, CURRENCY_USD);

    await mockJbPrices.mock.priceFor
      .withArgs(CURRENCY_USD, CURRENCY_ETH, _FIXED_POINT_MAX_FIDELITY)
      .returns(usdToEthPrice);

    await mockJbTerminal.mock.currency.returns(CURRENCY_USD);

    // Record the used allowance
    await expect(
      SNOWSingleTokenPaymentTerminalStore.connect(mockJbTerminalSigner).recordUsedAllowanceOf(
        PROJECT_ID,
        AMOUNT,
        CURRENCY_USD,
      ),
    ).to.be.revertedWith(errors.INADEQUATE_PAYMENT_TERMINAL_STORE_BALANCE);
  });
});
