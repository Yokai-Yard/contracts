import { expect } from 'chai';
import { ethers } from 'hardhat';

import { deployMockContract } from '@ethereum-waffle/mock-contract';

import { packFundingCycleMetadata, impersonateAccount } from '../helpers/utils';

import snowController from '../../artifacts/contracts/interfaces/ISNOWController.sol/ISNOWController.json';
import snowDirectory from '../../artifacts/contracts/interfaces/ISNOWDirectory.sol/ISNOWDirectory.json';
import jBFundingCycleStore from '../../artifacts/contracts/interfaces/ISNOWFundingCycleStore.sol/ISNOWFundingCycleStore.json';
import snowPrices from '../../artifacts/contracts/interfaces/ISNOWPrices.sol/ISNOWPrices.json';
import snowProjects from '../../artifacts/contracts/interfaces/ISNOWProjects.sol/ISNOWProjects.json';
import snowTerminal from '../../artifacts/contracts/abstract/SNOWPayoutRedemptionPaymentTerminal.sol/SNOWPayoutRedemptionPaymentTerminal.json';
import snowTokenStore from '../../artifacts/contracts/interfaces/ISNOWTokenStore.sol/ISNOWTokenStore.json';

describe('SNOWSingleTokenPaymentTerminalStore::currentOverflowOf(...)', function () {
  const PROJECT_ID = 2;
  const AMOUNT = ethers.FixedNumber.fromString('4398541.345');
  const WEIGHT = ethers.FixedNumber.fromString('900000000.23411');
  const CURRENCY = 1;
  const _FIXED_POINT_MAX_FIDELITY = 18;

  async function setup() {
    const [deployer] = await ethers.getSigners();

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

    const token = ethers.Wallet.createRandom().address;

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

    await mockJbTerminal.mock.currency.returns(CURRENCY);

    return {
      mockJbTerminal,
      mockJbController,
      mockJbDirectory,
      mockJbFundingCycleStore,
      mockJbPrices,
      SNOWSingleTokenPaymentTerminalStore,
      timestamp,
      token,
      CURRENCY_ETH,
      CURRENCY_USD,
    };
  }

  it('Should return the current overflowed amount', async function () {
    const {
      mockJbTerminal,
      mockJbController,
      mockJbDirectory,
      mockJbFundingCycleStore,
      mockJbPrices,
      SNOWSingleTokenPaymentTerminalStore,
      timestamp,
      token,
      CURRENCY_ETH,
      CURRENCY_USD,
    } = await setup();

    await mockJbFundingCycleStore.mock.currentOf.withArgs(PROJECT_ID).returns({
      number: 1,
      configuration: timestamp,
      basedOn: timestamp,
      start: timestamp,
      duration: 0,
      weight: WEIGHT,
      discountRate: 0,
      ballot: ethers.constants.AddressZero,
      metadata: packFundingCycleMetadata(),
    });

    await mockJbDirectory.mock.controllerOf.withArgs(PROJECT_ID).returns(mockJbController.address);

    await mockJbTerminal.mock.token.returns(token);

    await mockJbController.mock.distributionLimitOf
      .withArgs(PROJECT_ID, timestamp, mockJbTerminal.address, token)
      .returns(AMOUNT, CURRENCY_USD);

    await mockJbPrices.mock.priceFor
      .withArgs(CURRENCY_USD, CURRENCY_ETH, _FIXED_POINT_MAX_FIDELITY)
      .returns(ethers.FixedNumber.from(1));

    // Add to balance beforehand to have sufficient overflow
    const startingBalance = AMOUNT.mulUnsafe(ethers.FixedNumber.from(2));
    await SNOWSingleTokenPaymentTerminalStore.connect(
      await impersonateAccount(mockJbTerminal.address),
    ).recordAddedBalanceFor(PROJECT_ID, startingBalance);

    // Get current overflow
    expect(
      await SNOWSingleTokenPaymentTerminalStore.currentOverflowOf(mockJbTerminal.address, PROJECT_ID),
    ).to.equal(AMOUNT);
  });

  it('Should return 0 overflow if ETH balance < distribution remaining', async function () {
    const {
      mockJbTerminal,
      mockJbController,
      mockJbDirectory,
      mockJbFundingCycleStore,
      SNOWSingleTokenPaymentTerminalStore,
      timestamp,
      token,
      CURRENCY_ETH,
    } = await setup();

    await mockJbFundingCycleStore.mock.currentOf.withArgs(PROJECT_ID).returns({
      number: 1,
      configuration: timestamp,
      basedOn: timestamp,
      start: timestamp,
      duration: 0,
      weight: WEIGHT,
      discountRate: 0,
      ballot: ethers.constants.AddressZero,
      metadata: packFundingCycleMetadata(),
    });

    await mockJbDirectory.mock.controllerOf.withArgs(PROJECT_ID).returns(mockJbController.address);

    await mockJbController.mock.distributionLimitOf
      .withArgs(PROJECT_ID, timestamp, mockJbTerminal.address, token)
      .returns(AMOUNT, CURRENCY_ETH);

    // Get current overflow
    expect(
      await SNOWSingleTokenPaymentTerminalStore.currentOverflowOf(mockJbTerminal.address, PROJECT_ID),
    ).to.equal(0);
  });

  it('Should return 0 overflow if ETH balance is 0', async function () {
    const {
      mockJbFundingCycleStore,
      mockJbTerminal,
      SNOWSingleTokenPaymentTerminalStore,
      timestamp,
    } = await setup();

    await mockJbFundingCycleStore.mock.currentOf.withArgs(PROJECT_ID).returns({
      number: 1,
      configuration: timestamp,
      basedOn: timestamp,
      start: timestamp,
      duration: 0,
      weight: WEIGHT,
      discountRate: 0,
      ballot: ethers.constants.AddressZero,
      metadata: packFundingCycleMetadata(),
    });

    // Get current overflow
    expect(
      await SNOWSingleTokenPaymentTerminalStore.currentOverflowOf(mockJbTerminal.address, PROJECT_ID),
    ).to.equal(0);
  });
});
