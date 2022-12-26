import { expect } from 'chai';
import { ethers } from 'hardhat';
import errors from '../../helpers/errors.json';

import { deployMockContract } from '@ethereum-waffle/mock-contract';

import snowDirectory from '../../../artifacts/contracts/interfaces/ISNOWDirectory.sol/ISNOWDirectory.json';
import snowPaymentTerminalStore from '../../../artifacts/contracts/SNOWSingleTokenPaymentTerminalStore.sol/SNOWSingleTokenPaymentTerminalStore.json';
import snowOperatoreStore from '../../../artifacts/contracts/interfaces/ISNOWOperatorStore.sol/ISNOWOperatorStore.json';
import snowProjects from '../../../artifacts/contracts/interfaces/ISNOWProjects.sol/ISNOWProjects.json';
import snowSplitsStore from '../../../artifacts/contracts/interfaces/ISNOWSplitsStore.sol/ISNOWSplitsStore.json';
import snowPrices from '../../../artifacts/contracts/interfaces/ISNOWPrices.sol/ISNOWPrices.json';

describe('SNOWPayoutRedemptionPaymentTerminal::setFee(...)', function () {
  const NEW_FEE = 8; // 4%

  async function setup() {
    let [deployer, terminalOwner, caller] = await ethers.getSigners();

    let [
      mockJbDirectory,
      mockSNOWPaymentTerminalStore,
      mockJbOperatorStore,
      mockJbProjects,
      mockJbSplitsStore,
      mockJbPrices,
    ] = await Promise.all([
      deployMockContract(deployer, snowDirectory.abi),
      deployMockContract(deployer, snowPaymentTerminalStore.abi),
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
      snowEthPaymentTerminal,
      terminalOwner,
      caller,
    };
  }

  it('Should set new fee and emit event if caller is terminal owner', async function () {
    const { snowEthPaymentTerminal, terminalOwner } = await setup();

    expect(await snowEthPaymentTerminal.connect(terminalOwner).setFee(NEW_FEE))
      .to.emit(snowEthPaymentTerminal, 'SetFee')
      .withArgs(NEW_FEE, terminalOwner.address);
  });

  it("Can't set fee above 5%", async function () {
    const { snowEthPaymentTerminal, terminalOwner } = await setup();
    await expect(snowEthPaymentTerminal.connect(terminalOwner).setFee(50_000_001)) // 5.0000001% (out of 1,000,000,000)
      .to.be.revertedWith(errors.FEE_TOO_HIGH);
  });

  it("Can't set fee if caller is not owner", async function () {
    const { snowEthPaymentTerminal, caller } = await setup();
    await expect(snowEthPaymentTerminal.connect(caller).setFee(40_000_000)).to.be.revertedWith(
      'Ownable: caller is not the owner',
    );
  });
});
