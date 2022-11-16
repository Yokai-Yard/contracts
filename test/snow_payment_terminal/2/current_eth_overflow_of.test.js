import { expect } from 'chai';
import { ethers } from 'hardhat';
import { deployMockContract } from '@ethereum-waffle/mock-contract';

import snowDirectory from '../../../artifacts/contracts/SNOWDirectory.sol/SNOWDirectory.json';
import snowPaymentTerminalStore from '../../../artifacts/contracts/SNOWSingleTokenPaymentTerminalStore.sol/SNOWSingleTokenPaymentTerminalStore.json';
import snowOperatoreStore from '../../../artifacts/contracts/SNOWOperatorStore.sol/SNOWOperatorStore.json';
import snowPrices from '../../../artifacts/contracts/interfaces/ISNOWPrices.sol/ISNOWPrices.json';
import snowProjects from '../../../artifacts/contracts/SNOWProjects.sol/SNOWProjects.json';
import snowSplitsStore from '../../../artifacts/contracts/SNOWSplitsStore.sol/SNOWSplitsStore.json';
import snowToken from '../../../artifacts/contracts/SNOWToken.sol/SNOWToken.json';

describe('SNOWPayoutRedemptionPaymentTerminal::currentEthOverflowOf(...)', function () {
  const PROJECT_ID = 2;
  const AMOUNT = ethers.utils.parseEther('10');
  const PRICE = ethers.BigNumber.from('100');
  let CURRENCY_ETH;
  let CURRENCY_USD;

  before(async function () {
    const snowCurrenciesFactory = await ethers.getContractFactory('SNOWCurrencies');
    const snowCurrencies = await snowCurrenciesFactory.deploy();
    CURRENCY_ETH = await snowCurrencies.ETH();
    CURRENCY_USD = await snowCurrencies.USD();
  });

  async function setup() {
    let [deployer, terminalOwner, caller] = await ethers.getSigners();

    const SPLITS_GROUP = 1;

    let [
      mockJbDirectory,
      mockSNOWPaymentTerminalStore,
      mockJbOperatorStore,
      mockJbProjects,
      mockJbSplitsStore,
      mockJbPrices,
      mockJbToken,
    ] = await Promise.all([
      deployMockContract(deployer, snowDirectory.abi),
      deployMockContract(deployer, snowPaymentTerminalStore.abi),
      deployMockContract(deployer, snowOperatoreStore.abi),
      deployMockContract(deployer, snowProjects.abi),
      deployMockContract(deployer, snowSplitsStore.abi),
      deployMockContract(deployer, snowPrices.abi),
      deployMockContract(deployer, snowToken.abi),
    ]);

    let snowTerminalFactory = await ethers.getContractFactory(
      'contracts/SNOWETHPaymentTerminal.sol:SNOWETHPaymentTerminal',
      deployer,
    );
    let snowErc20TerminalFactory = await ethers.getContractFactory(
      'contracts/SNOWERC20PaymentTerminal.sol:SNOWERC20PaymentTerminal',
      deployer,
    );

    // ETH terminal
    let snowEthPaymentTerminal = await snowTerminalFactory
      .connect(deployer)
      .deploy(
        /*base weight currency*/ CURRENCY_ETH,
        mockJbOperatorStore.address,
        mockJbProjects.address,
        mockJbDirectory.address,
        mockJbSplitsStore.address,
        mockJbPrices.address,
        mockSNOWPaymentTerminalStore.address,
        terminalOwner.address,
      );

    // Non-eth 16 decimals terminal
    const NON_ETH_TOKEN = mockJbToken.address;
    const DECIMALS = 16;
    await mockJbToken.mock.decimals.returns(DECIMALS);

    let SNOWERC20PaymentTerminal = await snowErc20TerminalFactory
      .connect(deployer)
      .deploy(
        NON_ETH_TOKEN,
        CURRENCY_USD,
        CURRENCY_USD,
        SPLITS_GROUP,
        mockJbOperatorStore.address,
        mockJbProjects.address,
        mockJbDirectory.address,
        mockJbSplitsStore.address,
        mockJbPrices.address,
        mockSNOWPaymentTerminalStore.address,
        terminalOwner.address,
      );

    await mockSNOWPaymentTerminalStore.mock.currentOverflowOf
      .withArgs(snowEthPaymentTerminal.address, PROJECT_ID)
      .returns(AMOUNT);
    await mockSNOWPaymentTerminalStore.mock.currentOverflowOf
      .withArgs(SNOWERC20PaymentTerminal.address, PROJECT_ID)
      .returns(AMOUNT);

    await mockSNOWPaymentTerminalStore.mock.prices.returns(mockJbPrices.address);

    return {
      caller,
      snowEthPaymentTerminal,
      SNOWERC20PaymentTerminal,
      mockJbDirectory,
      mockJbPrices,
      mockSNOWPaymentTerminalStore,
    };
  }

  it('Should return the current terminal overflow in eth if the terminal uses eth as currency', async function () {
    const { snowEthPaymentTerminal } = await setup();
    expect(await snowEthPaymentTerminal.currentEthOverflowOf(PROJECT_ID)).to.equal(AMOUNT);
  });

  it('Should return the current terminal overflow quoted in eth if the terminal uses another currency than eth', async function () {
    const { mockJbPrices, SNOWERC20PaymentTerminal } = await setup();

    await mockJbPrices.mock.priceFor
      .withArgs(CURRENCY_USD, CURRENCY_ETH, 16) // 16-decimal
      .returns(100);

    expect(await SNOWERC20PaymentTerminal.currentEthOverflowOf(PROJECT_ID)).to.equal(
      AMOUNT.mul(ethers.utils.parseEther('1')).div(PRICE),
    );
  });
});
