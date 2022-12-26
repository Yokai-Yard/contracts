import { expect } from 'chai';
import { ethers } from 'hardhat';

import { deployMockContract } from '@ethereum-waffle/mock-contract';

import { packFundingCycleMetadata } from '../helpers/utils';

import snowController from '../../artifacts/contracts/interfaces/ISNOWController.sol/ISNOWController.json';
import snowDirectory from '../../artifacts/contracts/interfaces/ISNOWDirectory.sol/ISNOWDirectory.json';
import jBFundingCycleStore from '../../artifacts/contracts/interfaces/ISNOWFundingCycleStore.sol/ISNOWFundingCycleStore.json';
import snowPrices from '../../artifacts/contracts/interfaces/ISNOWPrices.sol/ISNOWPrices.json';
import snowProjects from '../../artifacts/contracts/interfaces/ISNOWProjects.sol/ISNOWProjects.json';
import snowPaymentTerminal from '../../artifacts/contracts/abstract/SNOWPayoutRedemptionPaymentTerminal.sol/SNOWPayoutRedemptionPaymentTerminal.json';
import snowTokenStore from '../../artifacts/contracts/interfaces/ISNOWTokenStore.sol/ISNOWTokenStore.json';

describe('SNOWSingleTokenPaymentTerminalStore::currentTotalOverflowOf(...)', function () {
  const PROJECT_ID = 2;
  const WEIGHT = ethers.BigNumber.from('1' + '0'.repeat(17));

  const ETH_OVERFLOW_A = ethers.utils.parseEther('69000');
  const ETH_OVERFLOW_B = ethers.utils.parseEther('420');
  const PRICE = ethers.BigNumber.from('100');
  const DECIMAL = 18;
  const NON_18_DECIMAL = 12;

  async function setup() {
    const [deployer] = await ethers.getSigners();

    const mockJbPrices = await deployMockContract(deployer, snowPrices.abi);
    const mockJbProjects = await deployMockContract(deployer, snowProjects.abi);
    const mockJbDirectory = await deployMockContract(deployer, snowDirectory.abi);
    const mockJbFundingCycleStore = await deployMockContract(deployer, jBFundingCycleStore.abi);
    const mockJbTokenStore = await deployMockContract(deployer, snowTokenStore.abi);
    const mockJbController = await deployMockContract(deployer, snowController.abi);
    const mockJbTerminalA = await deployMockContract(deployer, snowPaymentTerminal.abi);
    const mockJbTerminalB = await deployMockContract(deployer, snowPaymentTerminal.abi);

    const snowCurrenciesFactory = await ethers.getContractFactory('SNOWCurrencies');
    const snowCurrencies = await snowCurrenciesFactory.deploy();
    const CURRENCY_AVAX = await snowCurrencies.AVAX();
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

    return {
      mockJbTerminalA,
      mockJbTerminalB,
      mockJbController,
      mockJbDirectory,
      mockJbFundingCycleStore,
      mockJbPrices,
      SNOWSingleTokenPaymentTerminalStore,
      timestamp,
      CURRENCY_ETH,
      CURRENCY_USD,
    };
  }

  it('Should return total current overflow across multiple terminals with the same currency (18 decimals) as the one passed', async function () {
    const {
      mockJbTerminalA,
      mockJbTerminalB,
      mockJbDirectory,
      mockJbFundingCycleStore,
      mockJbPrices,
      SNOWSingleTokenPaymentTerminalStore,
      timestamp,
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
      metadata: packFundingCycleMetadata({ useTotalOverflowForRedemptions: true }),
    });

    await mockJbDirectory.mock.terminalsOf
      .withArgs(PROJECT_ID)
      .returns([mockJbTerminalA.address, mockJbTerminalB.address]);

    await mockJbTerminalA.mock.currentEthOverflowOf.withArgs(PROJECT_ID).returns(ETH_OVERFLOW_A);
    await mockJbTerminalB.mock.currentEthOverflowOf.withArgs(PROJECT_ID).returns(ETH_OVERFLOW_B);

    // Get total overflow across both terminals, in same currency; should equal sum of the overflows
    expect(
      await SNOWSingleTokenPaymentTerminalStore.currentTotalOverflowOf(
        PROJECT_ID,
        DECIMAL,
        CURRENCY_ETH,
      ),
    ).to.equal(ETH_OVERFLOW_A.add(ETH_OVERFLOW_B));
  });

  it('Should return total current overflow across multiple terminals with the same currency as the one passed, adjusting non-18 decimals', async function () {
    const {
      mockJbTerminalA,
      mockJbTerminalB,
      mockJbDirectory,
      mockJbFundingCycleStore,
      mockJbPrices,
      SNOWSingleTokenPaymentTerminalStore,
      timestamp,
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
      metadata: packFundingCycleMetadata({ useTotalOverflowForRedemptions: true }),
    });

    await mockJbDirectory.mock.terminalsOf
      .withArgs(PROJECT_ID)
      .returns([mockJbTerminalA.address, mockJbTerminalB.address]);

    await mockJbTerminalA.mock.currentEthOverflowOf.withArgs(PROJECT_ID).returns(ETH_OVERFLOW_A);
    await mockJbTerminalB.mock.currentEthOverflowOf.withArgs(PROJECT_ID).returns(ETH_OVERFLOW_B);

    // Get total overflow across both terminals, in same currency; should equal sum of the overflows
    expect(
      await SNOWSingleTokenPaymentTerminalStore.currentTotalOverflowOf(
        PROJECT_ID,
        NON_18_DECIMAL,
        CURRENCY_ETH,
      ),
    ).to.equal(ETH_OVERFLOW_A.add(ETH_OVERFLOW_B).div(10 ** (DECIMAL - NON_18_DECIMAL)));
  });

  it('Should return total current overflow across multiple terminals with different currency as the one passed', async function () {
    const {
      mockJbTerminalA,
      mockJbTerminalB,
      mockJbDirectory,
      mockJbFundingCycleStore,
      mockJbPrices,
      SNOWSingleTokenPaymentTerminalStore,
      timestamp,
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
      metadata: packFundingCycleMetadata({ useTotalOverflowForRedemptions: true }),
    });

    await mockJbDirectory.mock.terminalsOf
      .withArgs(PROJECT_ID)
      .returns([mockJbTerminalA.address, mockJbTerminalB.address]);

    await mockJbTerminalA.mock.currentEthOverflowOf.withArgs(PROJECT_ID).returns(ETH_OVERFLOW_A);
    await mockJbTerminalB.mock.currentEthOverflowOf.withArgs(PROJECT_ID).returns(ETH_OVERFLOW_B);

    await mockJbPrices.mock.priceFor
      .withArgs(CURRENCY_ETH, CURRENCY_USD, 18) // 18-decimal
      .returns(100);

    // Get total overflow across both terminals, in a different currency; should equal to the sum of the overflow / price
    expect(
      await SNOWSingleTokenPaymentTerminalStore.currentTotalOverflowOf(
        PROJECT_ID,
        DECIMAL,
        CURRENCY_USD,
      ),
    ).to.equal(ETH_OVERFLOW_A.add(ETH_OVERFLOW_B).mul(ethers.utils.parseEther('1')).div(PRICE));
  });
});
