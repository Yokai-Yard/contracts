import { expect } from 'chai';
import { ethers } from 'hardhat';
import { deployMockContract } from '@ethereum-waffle/mock-contract';
import { makeSplits, packFundingCycleMetadata, setBalance } from '../../helpers/utils.js';

import errors from '../../helpers/errors.json';

import snowDirectory from '../../../artifacts/contracts/SNOWDirectory.sol/SNOWDirectory.json';
import SNOWEthPaymentTerminal from '../../../artifacts/contracts/SNOWETHPaymentTerminal.sol/SNOWETHPaymentTerminal.json';
import snowPaymentTerminalStore from '../../../artifacts/contracts/SNOWSingleTokenPaymentTerminalStore.sol/SNOWSingleTokenPaymentTerminalStore.json';
import snowOperatoreStore from '../../../artifacts/contracts/SNOWOperatorStore.sol/SNOWOperatorStore.json';
import snowProjects from '../../../artifacts/contracts/SNOWProjects.sol/SNOWProjects.json';
import snowSplitsStore from '../../../artifacts/contracts/SNOWSplitsStore.sol/SNOWSplitsStore.json';
import snowToken from '../../../artifacts/contracts/SNOWToken.sol/SNOWToken.json';
import snowPrices from '../../../artifacts/contracts/SNOWPrices.sol/SNOWPrices.json';

describe('SNOWPayoutRedemptionPaymentTerminal::getters', function () {
  const ETH_ADDRESS = '0x000000000000000000000000000000000000EEEe';
  let CURRENCY_ETH;

  before(async function () {
    const snowCurrenciesFactory = await ethers.getContractFactory('SNOWCurrencies');
    const snowCurrencies = await snowCurrenciesFactory.deploy();
    CURRENCY_AVAX = await snowCurrencies.AVAX();
  });

  async function setup() {
    let [deployer, terminalOwner] = await ethers.getSigners();

    const SPLITS_GROUP = 1;

    let [
      mockJbDirectory,
      mockJbEthPaymentTerminal,
      mockSNOWPaymentTerminalStore,
      mockJbOperatorStore,
      mockJbProjects,
      mockJbSplitsStore,
      mockJbPrices,
      mockJbToken,
    ] = await Promise.all([
      deployMockContract(deployer, snowDirectory.abi),
      deployMockContract(deployer, SNOWEthPaymentTerminal.abi),
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
    const NON_ETH_TOKEN = mockJbToken.address;

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

    const DECIMALS = 1;

    await mockJbToken.mock.decimals.returns(DECIMALS);

    let SNOWERC20PaymentTerminal = await snowErc20TerminalFactory
      .connect(deployer)
      .deploy(
        NON_ETH_TOKEN,
        CURRENCY_ETH,
        CURRENCY_ETH,
        SPLITS_GROUP,
        mockJbOperatorStore.address,
        mockJbProjects.address,
        mockJbDirectory.address,
        mockJbSplitsStore.address,
        mockJbPrices.address,
        mockSNOWPaymentTerminalStore.address,
        terminalOwner.address,
      );

    return {
      snowEthPaymentTerminal,
      SNOWERC20PaymentTerminal,
      NON_ETH_TOKEN,
      DECIMALS,
    };
  }

  it('Should return true if the terminal accepts a token', async function () {
    const { SNOWERC20PaymentTerminal, snowEthPaymentTerminal, NON_ETH_TOKEN } = await setup();
    expect(await SNOWERC20PaymentTerminal.acceptsToken(NON_ETH_TOKEN, /*projectId*/ 0)).to.be.true;

    expect(await SNOWERC20PaymentTerminal.acceptsToken(ETH_ADDRESS, /*projectId*/ 0)).to.be.false;

    expect(await snowEthPaymentTerminal.acceptsToken(ETH_ADDRESS, /*projectId*/ 0)).to.be.true;

    expect(await snowEthPaymentTerminal.acceptsToken(NON_ETH_TOKEN, /*projectId*/ 0)).to.be.false;
  });

  it('Should return the decimals for the token', async function () {
    const { SNOWERC20PaymentTerminal, snowEthPaymentTerminal, NON_ETH_TOKEN, DECIMALS } = await setup();
    expect(await SNOWERC20PaymentTerminal.decimalsForToken(NON_ETH_TOKEN)).to.equal(DECIMALS);

    expect(await snowEthPaymentTerminal.decimalsForToken(ETH_ADDRESS)).to.equal(18);
  });

  it('Should return the currency for the token', async function () {
    const { SNOWERC20PaymentTerminal, snowEthPaymentTerminal, NON_ETH_TOKEN } = await setup();
    expect(await SNOWERC20PaymentTerminal.currencyForToken(NON_ETH_TOKEN)).to.equal(CURRENCY_ETH);

    expect(await snowEthPaymentTerminal.currencyForToken(ETH_ADDRESS)).to.equal(CURRENCY_ETH);
  });
});
