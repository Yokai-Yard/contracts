import { expect } from 'chai';
import { ethers } from 'hardhat';

import { deployMockContract } from '@ethereum-waffle/mock-contract';

import snowDirectory from '../../../artifacts/contracts/interfaces/ISNOWDirectory.sol/ISNOWDirectory.json';
import snowPaymentTerminalStore from '../../../artifacts/contracts/SNOWSingleTokenPaymentTerminalStore.sol/SNOWSingleTokenPaymentTerminalStore.json';
import snowFeeGauge from '../../../artifacts/contracts/interfaces/ISNOWFeeGauge.sol/ISNOWFeeGauge.json';
import snowOperatoreStore from '../../../artifacts/contracts/interfaces/ISNOWOperatorStore.sol/ISNOWOperatorStore.json';
import snowProjects from '../../../artifacts/contracts/interfaces/ISNOWProjects.sol/ISNOWProjects.json';
import snowSplitsStore from '../../../artifacts/contracts/interfaces/ISNOWSplitsStore.sol/ISNOWSplitsStore.json';
import snowPrices from '../../../artifacts/contracts/interfaces/ISNOWPrices.sol/ISNOWPrices.json';

describe('SNOWPayoutRedemptionPaymentTerminal::setFeeGauge(...)', function () {
  async function setup() {
    let [deployer, terminalOwner, caller] = await ethers.getSigners();

    let [
      mockJbDirectory,
      mockSNOWPaymentTerminalStore,
      mockJbFeeGauge,
      mockJbOperatorStore,
      mockJbProjects,
      mockJbSplitsStore,
      mockJbPrices,
    ] = await Promise.all([
      deployMockContract(deployer, snowDirectory.abi),
      deployMockContract(deployer, snowPaymentTerminalStore.abi),
      deployMockContract(deployer, snowFeeGauge.abi),
      deployMockContract(deployer, snowOperatoreStore.abi),
      deployMockContract(deployer, snowProjects.abi),
      deployMockContract(deployer, snowSplitsStore.abi),
      deployMockContract(deployer, snowPrices.abi),
    ]);

    const snowCurrenciesFactory = await ethers.getContractFactory('SNOWCurrencies');
    const snowCurrencies = await snowCurrenciesFactory.deploy();
    const CURRENCY_AVAX = await snowCurrencies.AVAX();

    let snowTerminalFactory = await ethers.getContractFactory(
      'contracts/SNOWETHPaymentTerminal.sol:SNOWETHPaymentTerminal',
      deployer,
    );

    let snowEthPaymentTerminal = await snowTerminalFactory
      .connect(deployer)
      .deploy(
        CURRENCY_ETH,
        mockJbOperatorStore.address,
        mockJbProjects.address,
        mockJbDirectory.address,
        mockJbSplitsStore.address,
        mockJbPrices.address,
        mockSNOWPaymentTerminalStore.address,
        terminalOwner.address,
      );

    return {
      terminalOwner,
      caller,
      snowEthPaymentTerminal,
      mockJbFeeGauge,
    };
  }

  it('Should set the fee gauge and emit event if caller is terminal owner', async function () {
    const { terminalOwner, snowEthPaymentTerminal, mockJbFeeGauge } = await setup();

    expect(await snowEthPaymentTerminal.connect(terminalOwner).setFeeGauge(mockJbFeeGauge.address))
      .to.emit(snowEthPaymentTerminal, 'SetFeeGauge')
      .withArgs(mockJbFeeGauge.address, terminalOwner.address);
  });
  it("Can't set the fee gauge if caller is not the terminal owner", async function () {
    const { caller, snowEthPaymentTerminal, mockJbFeeGauge } = await setup();

    await expect(
      snowEthPaymentTerminal.connect(caller).setFeeGauge(mockJbFeeGauge.address),
    ).to.be.revertedWith('Ownable: caller is not the owner');
  });
});
