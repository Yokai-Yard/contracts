import { expect } from 'chai';
import { ethers } from 'hardhat';
import { deployMockContract } from '@ethereum-waffle/mock-contract';
import { setBalance } from '../../helpers/utils';
import errors from '../../helpers/errors.json';

import snowDirectory from '../../../artifacts/contracts/SNOWDirectory.sol/SNOWDirectory.json';
import SNOWEthPaymentTerminal from '../../../artifacts/contracts/SNOWETHPaymentTerminal.sol/SNOWETHPaymentTerminal.json';
import snowErc20PaymentTerminal from '../../../artifacts/contracts/SNOWERC20PaymentTerminal.sol/SNOWERC20PaymentTerminal.json';
import snowPaymentTerminalStore from '../../../artifacts/contracts/SNOWSingleTokenPaymentTerminalStore.sol/SNOWSingleTokenPaymentTerminalStore.json';
import snowOperatoreStore from '../../../artifacts/contracts/SNOWOperatorStore.sol/SNOWOperatorStore.json';
import snowProjects from '../../../artifacts/contracts/SNOWProjects.sol/SNOWProjects.json';
import snowSplitsStore from '../../../artifacts/contracts/SNOWSplitsStore.sol/SNOWSplitsStore.json';
import snowPrices from '../../../artifacts/contracts/SNOWPrices.sol/SNOWPrices.json';
import snowToken from '../../../artifacts/contracts/SNOWToken.sol/SNOWToken.json';

describe('SNOWPayoutRedemptionPaymentTerminal::migrate(...)', function () {
  const PROJECT_ID = 2;
  const CURRENT_TERMINAL_BALANCE = ethers.utils.parseEther('10');

  let MIGRATE_TERMINAL_PERMISSION_INDEX;

  before(async function () {
    let snowOperationsFactory = await ethers.getContractFactory('SNOWOperations');
    let snowOperations = await snowOperationsFactory.deploy();

    MIGRATE_TERMINAL_PERMISSION_INDEX = await snowOperations.MIGRATE_TERMINAL();
  });

  async function setup() {
    let [deployer, projectOwner, terminalOwner, caller, ...addrs] = await ethers.getSigners();

    let [
      mockJbDirectory,
      mockJbEthPaymentTerminal,
      mockSNOWERC20PaymentTerminal,
      mockSNOWPaymentTerminalStore,
      mockJbOperatorStore,
      mockJbProjects,
      mockJbSplitsStore,
      mockJbPrices,
      mockJbToken,
    ] = await Promise.all([
      deployMockContract(deployer, snowDirectory.abi),
      deployMockContract(deployer, SNOWEthPaymentTerminal.abi),
      deployMockContract(deployer, snowErc20PaymentTerminal.abi),
      deployMockContract(deployer, snowPaymentTerminalStore.abi),
      deployMockContract(deployer, snowOperatoreStore.abi),
      deployMockContract(deployer, snowProjects.abi),
      deployMockContract(deployer, snowSplitsStore.abi),
      deployMockContract(deployer, snowPrices.abi),
      deployMockContract(deployer, snowToken.abi),
    ]);

    const snowCurrenciesFactory = await ethers.getContractFactory('SNOWCurrencies');
    const snowCurrencies = await snowCurrenciesFactory.deploy();
    const CURRENCY_AVAX = await snowCurrencies.AVAX();

    const snowTokensFactory = await ethers.getContractFactory('SNOWTokens');
    const snowTokens = await snowTokensFactory.deploy();
    const TOKEN_AVAX = await snowTokens.AVAX();
    const NON_ETH_TOKEN = mockJbToken.address;

    const SPLITS_GROUP = 1;

    let snowEthTerminalFactory = await ethers.getContractFactory(
      'contracts/SNOWETHPaymentTerminal.sol:SNOWETHPaymentTerminal',
      deployer,
    );
    let snowErc20TerminalFactory = await ethers.getContractFactory(
      'contracts/SNOWERC20PaymentTerminal.sol:SNOWERC20PaymentTerminal',
      deployer,
    );

    let snowEthPaymentTerminal = await snowEthTerminalFactory
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

    await mockJbOperatorStore.mock.hasPermission
      .withArgs(
        projectOwner.address,
        projectOwner.address,
        PROJECT_ID,
        MIGRATE_TERMINAL_PERMISSION_INDEX,
      )
      .returns(true);

    await mockJbProjects.mock.ownerOf.withArgs(PROJECT_ID).returns(projectOwner.address);

    await mockJbEthPaymentTerminal.mock.token.returns(TOKEN_ETH);
    await mockJbEthPaymentTerminal.mock.acceptsToken.withArgs(TOKEN_ETH, PROJECT_ID).returns(true);

    await mockSNOWERC20PaymentTerminal.mock.token.returns(NON_ETH_TOKEN);
    await mockSNOWERC20PaymentTerminal.mock.acceptsToken
      .withArgs(NON_ETH_TOKEN, PROJECT_ID)
      .returns(true);

    // addToBalanceOf _amount is 0 if AVAX terminal
    await mockJbEthPaymentTerminal.mock.addToBalanceOf
      .withArgs(PROJECT_ID, CURRENT_TERMINAL_BALANCE, TOKEN_ETH, '', '0x')
      .returns();
    await mockSNOWERC20PaymentTerminal.mock.addToBalanceOf
      .withArgs(PROJECT_ID, CURRENT_TERMINAL_BALANCE, NON_ETH_TOKEN, '', '0x')
      .returns();

    await setBalance(snowEthPaymentTerminal.address, CURRENT_TERMINAL_BALANCE);
    await setBalance(SNOWERC20PaymentTerminal.address, CURRENT_TERMINAL_BALANCE);

    await mockSNOWPaymentTerminalStore.mock.recordMigration
      .withArgs(PROJECT_ID)
      .returns(CURRENT_TERMINAL_BALANCE);

    return {
      deployer,
      projectOwner,
      terminalOwner,
      caller,
      addrs,
      snowEthPaymentTerminal,
      SNOWERC20PaymentTerminal,
      mockJbEthPaymentTerminal,
      mockSNOWERC20PaymentTerminal,
      mockSNOWPaymentTerminalStore,
      mockJbOperatorStore,
      mockJbToken,
      TOKEN_ETH,
    };
  }

  it('Should migrate terminal and emit event if caller is project owner', async function () {
    const { projectOwner, snowEthPaymentTerminal, mockJbEthPaymentTerminal } = await setup();

    expect(
      await snowEthPaymentTerminal
        .connect(projectOwner)
        .migrate(PROJECT_ID, mockJbEthPaymentTerminal.address),
    )
      .to.emit(snowEthPaymentTerminal, 'Migrate')
      .withArgs(
        PROJECT_ID,
        mockJbEthPaymentTerminal.address,
        CURRENT_TERMINAL_BALANCE,
        projectOwner.address,
      );
  });

  it('Should migrate terminal and emit event if caller is authorized', async function () {
    const {
      projectOwner,
      caller,
      snowEthPaymentTerminal,
      mockJbEthPaymentTerminal,
      mockJbOperatorStore,
    } = await setup();

    await mockJbOperatorStore.mock.hasPermission
      .withArgs(caller.address, projectOwner.address, PROJECT_ID, MIGRATE_TERMINAL_PERMISSION_INDEX)
      .returns(true);

    expect(
      await snowEthPaymentTerminal
        .connect(caller)
        .migrate(PROJECT_ID, mockJbEthPaymentTerminal.address),
    )
      .to.emit(snowEthPaymentTerminal, 'Migrate')
      .withArgs(
        PROJECT_ID,
        mockJbEthPaymentTerminal.address,
        CURRENT_TERMINAL_BALANCE,
        caller.address,
      );
  });

  it('Cannot migrate terminal if caller is not authorized', async function () {
    const {
      projectOwner,
      caller,
      snowEthPaymentTerminal,
      mockJbEthPaymentTerminal,
      mockJbOperatorStore,
    } = await setup();

    await mockJbOperatorStore.mock.hasPermission
      .withArgs(caller.address, projectOwner.address, PROJECT_ID, MIGRATE_TERMINAL_PERMISSION_INDEX)
      .returns(false);

    await mockJbOperatorStore.mock.hasPermission
      .withArgs(caller.address, projectOwner.address, 0, MIGRATE_TERMINAL_PERMISSION_INDEX)
      .returns(false);

    await expect(
      snowEthPaymentTerminal.connect(caller).migrate(PROJECT_ID, mockJbEthPaymentTerminal.address),
    ).to.be.revertedWith(errors.UNAUTHORIZED);
  });

  it('Should migrate non-eth terminal', async function () {
    const { projectOwner, SNOWERC20PaymentTerminal, mockSNOWERC20PaymentTerminal, mockJbToken } =
      await setup();

    await mockJbToken.mock['approve(address,uint256)']
      .withArgs(mockSNOWERC20PaymentTerminal.address, CURRENT_TERMINAL_BALANCE)
      .returns(0);
    await SNOWERC20PaymentTerminal.connect(projectOwner).migrate(
      PROJECT_ID,
      mockSNOWERC20PaymentTerminal.address,
    );
  });

  it('Should migrate terminal with empty balance and emit event if caller is project owner', async function () {
    const {
      projectOwner,
      snowEthPaymentTerminal,
      mockJbEthPaymentTerminal,
      mockSNOWPaymentTerminalStore,
    } = await setup();

    await mockSNOWPaymentTerminalStore.mock.recordMigration.withArgs(PROJECT_ID).returns(0);

    expect(
      await snowEthPaymentTerminal
        .connect(projectOwner)
        .migrate(PROJECT_ID, mockJbEthPaymentTerminal.address),
    )
      .to.emit(snowEthPaymentTerminal, 'Migrate')
      .withArgs(PROJECT_ID, mockJbEthPaymentTerminal.address, 0, projectOwner.address);
  });

  it("Can't migrate to a terminal which doesn't accept token", async function () {
    const { TOKEN_ETH, projectOwner, snowEthPaymentTerminal, mockJbEthPaymentTerminal } =
      await setup();

    await mockJbEthPaymentTerminal.mock.acceptsToken.withArgs(TOKEN_ETH, PROJECT_ID).returns(false);

    await expect(
      snowEthPaymentTerminal
        .connect(projectOwner)
        .migrate(PROJECT_ID, mockJbEthPaymentTerminal.address),
    ).to.be.revertedWith(errors.TERMINAL_TOKENS_INCOMPATIBLE);
  });
});
