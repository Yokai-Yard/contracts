import { expect } from 'chai';
import { ethers } from 'hardhat';

import { deployMockContract } from '@ethereum-waffle/mock-contract';

import snowDirectory from '../../../artifacts/contracts/interfaces/ISNOWDirectory.sol/ISNOWDirectory.json';
import SNOWEthPaymentTerminal from '../../../artifacts/contracts/SNOWETHPaymentTerminal.sol/SNOWETHPaymentTerminal.json';
import snowPaymentTerminalStore from '../../../artifacts/contracts/SNOWSingleTokenPaymentTerminalStore.sol/SNOWSingleTokenPaymentTerminalStore.json';
import snowOperatoreStore from '../../../artifacts/contracts/interfaces/ISNOWOperatorStore.sol/ISNOWOperatorStore.json';
import snowProjects from '../../../artifacts/contracts/interfaces/ISNOWProjects.sol/ISNOWProjects.json';
import snowSplitsStore from '../../../artifacts/contracts/interfaces/ISNOWSplitsStore.sol/ISNOWSplitsStore.json';
import snowPrices from '../../../artifacts/contracts/interfaces/ISNOWPrices.sol/ISNOWPrices.json';

describe('SNOWPayoutRedemptionPaymentTerminal::setFeelessAddress(...)', function () {
  async function setup() {
    let [deployer, terminalOwner, caller] = await ethers.getSigners();

    let [
      mockJbDirectory,
      mockJbEthPaymentTerminal,
      mockSNOWPaymentTerminalStore,
      mockJbOperatorStore,
      mockJbProjects,
      mockJbSplitsStore,
      mockJbPrices,
    ] = await Promise.all([
      deployMockContract(deployer, snowDirectory.abi),
      deployMockContract(deployer, SNOWEthPaymentTerminal.abi),
      deployMockContract(deployer, snowPaymentTerminalStore.abi),
      deployMockContract(deployer, snowOperatoreStore.abi),
      deployMockContract(deployer, snowProjects.abi),
      deployMockContract(deployer, snowSplitsStore.abi),
      deployMockContract(deployer, snowPrices.abi),
    ]);

    const snowCurrenciesFactory = await ethers.getContractFactory('SNOWCurrencies');
    const snowCurrencies = await snowCurrenciesFactory.deploy();
    const CURRENCY_ETH = await snowCurrencies.ETH();

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
      mockJbEthPaymentTerminal,
    };
  }

  it('Should add a terminal as feeless and emit event', async function () {
    const { terminalOwner, snowEthPaymentTerminal, mockJbEthPaymentTerminal } = await setup();

    expect(
      await snowEthPaymentTerminal
        .connect(terminalOwner)
        .setFeelessAddress(mockJbEthPaymentTerminal.address, true),
    )
      .to.emit(snowEthPaymentTerminal, 'SetFeelessAddress')
      .withArgs(mockJbEthPaymentTerminal.address, true, terminalOwner.address);

    expect(await snowEthPaymentTerminal.isFeelessAddress(mockJbEthPaymentTerminal.address)).to.be
      .true;
  });

  it('Should remove a terminal as feeless and emit event', async function () {
    const { terminalOwner, snowEthPaymentTerminal, mockJbEthPaymentTerminal } = await setup();

    await snowEthPaymentTerminal
      .connect(terminalOwner)
      .setFeelessAddress(mockJbEthPaymentTerminal.address, true);

    expect(
      await snowEthPaymentTerminal
        .connect(terminalOwner)
        .setFeelessAddress(mockJbEthPaymentTerminal.address, false),
    )
      .to.emit(snowEthPaymentTerminal, 'SetFeelessAddress')
      .withArgs(mockJbEthPaymentTerminal.address, false, terminalOwner.address);

    expect(await snowEthPaymentTerminal.isFeelessAddress(mockJbEthPaymentTerminal.address)).to.be
      .false;
  });

  it('Cannot set a feeless terminal if caller is not the owner', async function () {
    const { caller, snowEthPaymentTerminal, mockJbEthPaymentTerminal } = await setup();
    await expect(
      snowEthPaymentTerminal
        .connect(caller)
        .setFeelessAddress(mockJbEthPaymentTerminal.address, true),
    ).to.be.revertedWith('Ownable: caller is not the owner');
  });
});
