import { expect } from 'chai';
import { ethers } from 'hardhat';

import { deployMockContract } from '@ethereum-waffle/mock-contract';
import { impersonateAccount, packFundingCycleMetadata } from '../helpers/utils';

import errors from '../helpers/errors.json';

import snowController from '../../artifacts/contracts/interfaces/ISNOWController.sol/ISNOWController.json';
import snowFundingCycleStore from '../../artifacts/contracts/SNOWFundingCycleStore.sol/SNOWFundingCycleStore.json';
import snowOperatoreStore from '../../artifacts/contracts/SNOWOperatorStore.sol/SNOWOperatorStore.json';
import snowProjects from '../../artifacts/contracts/SNOWProjects.sol/SNOWProjects.json';
import snowTerminal from '../../artifacts/contracts/abstract/SNOWPayoutRedemptionPaymentTerminal.sol/SNOWPayoutRedemptionPaymentTerminal.json';

describe('SNOWDirectory::setPrimaryTerminalOf(...)', function () {
  const PROJECT_ID = 13;

  let SET_PRIMARY_TERMINAL_PERMISSION_INDEX;
  before(async function () {
    let snowOperationsFactory = await ethers.getContractFactory('SNOWOperations');
    let snowOperations = await snowOperationsFactory.deploy();

    SET_PRIMARY_TERMINAL_PERMISSION_INDEX = await snowOperations.SET_PRIMARY_TERMINAL();
  });

  async function setup() {
    let [deployer, projectOwner, ...addrs] = await ethers.getSigners();

    const blockNum = await ethers.provider.getBlockNumber();
    const block = await ethers.provider.getBlock(blockNum);
    const timestamp = block.timestamp;

    let mockJbFundingCycleStore = await deployMockContract(deployer, snowFundingCycleStore.abi);
    let mockJbOperatorStore = await deployMockContract(deployer, snowOperatoreStore.abi);
    let mockJbProjects = await deployMockContract(deployer, snowProjects.abi);

    let snowDirectoryFactory = await ethers.getContractFactory('SNOWDirectory');
    let snowDirectory = await snowDirectoryFactory.deploy(
      mockJbOperatorStore.address,
      mockJbProjects.address,
      mockJbFundingCycleStore.address,
      deployer.address,
    );

    let controller = await deployMockContract(projectOwner, snowController.abi);

    let terminal1 = await deployMockContract(projectOwner, snowTerminal.abi);
    let terminal2 = await deployMockContract(projectOwner, snowTerminal.abi);

    await mockJbProjects.mock.ownerOf.withArgs(PROJECT_ID).returns(projectOwner.address);

    await mockJbFundingCycleStore.mock.currentOf.withArgs(PROJECT_ID).returns({
      number: 1,
      configuration: timestamp,
      basedOn: timestamp,
      start: timestamp,
      duration: 0,
      weight: 0,
      discountRate: 0,
      ballot: ethers.constants.AddressZero,
      metadata: packFundingCycleMetadata({ global: { allowSetTerminals: true } }),
    });

    await mockJbProjects.mock.count.returns(PROJECT_ID);

    await snowDirectory.connect(projectOwner).setControllerOf(PROJECT_ID, controller.address);

    return {
      controller,
      projectOwner,
      deployer,
      addrs,
      snowDirectory,
      mockJbFundingCycleStore,
      mockJbOperatorStore,
      terminal1,
      terminal2,
      timestamp,
    };
  }

  it('Should set primary terminal and emit an event', async function () {
    const { projectOwner, snowDirectory, terminal1 } = await setup();

    // Initially no terminals should be set.
    let initialTerminals = [...(await snowDirectory.connect(projectOwner).terminalsOf(PROJECT_ID))];
    expect(initialTerminals.length).to.equal(0);

    const terminal1TokenAddress = ethers.Wallet.createRandom().address;
    await terminal1.mock.token.returns(terminal1TokenAddress);
    await terminal1.mock.acceptsToken.withArgs(terminal1TokenAddress, PROJECT_ID).returns(true);

    let tx = await snowDirectory
      .connect(projectOwner)
      .setPrimaryTerminalOf(PROJECT_ID, terminal1TokenAddress, terminal1.address);
    await expect(tx)
      .to.emit(snowDirectory, 'SetPrimaryTerminal')
      .withArgs(PROJECT_ID, terminal1TokenAddress, terminal1.address, projectOwner.address);

    let resultTerminals = [...(await snowDirectory.connect(projectOwner).terminalsOf(PROJECT_ID))];
    resultTerminals.sort();

    // After the primary terminal is set it should be added to the project.
    let expectedTerminals = [terminal1.address];
    expectedTerminals.sort();

    expect(resultTerminals).to.eql(expectedTerminals);
  });

  it('Should set primary terminal if caller is not project owner but has permissions', async function () {
    const { projectOwner, addrs, snowDirectory, mockJbOperatorStore, terminal1 } = await setup();
    let caller = addrs[1];

    let mockToken = ethers.Wallet.createRandom().address;

    await terminal1.mock.token.returns(mockToken);
    await terminal1.mock.acceptsToken.withArgs(mockToken, PROJECT_ID).returns(true);

    await mockJbOperatorStore.mock.hasPermission
      .withArgs(
        caller.address,
        projectOwner.address,
        PROJECT_ID,
        SET_PRIMARY_TERMINAL_PERMISSION_INDEX,
      )
      .returns(true);

    await expect(
      snowDirectory.connect(caller).setPrimaryTerminalOf(PROJECT_ID, mockToken, terminal1.address),
    ).to.not.be.reverted;
  });

  it('Should set a new primary terminal if the funding cycle prohibits it but caller is the controller', async function () {
    const {
      projectOwner,
      addrs,
      controller,
      snowDirectory,
      mockJbFundingCycleStore,
      mockJbOperatorStore,
      terminal1,
      timestamp,
    } = await setup();
    let caller = addrs[1];

    await mockJbFundingCycleStore.mock.currentOf.withArgs(PROJECT_ID).returns({
      number: 1,
      configuration: timestamp,
      basedOn: timestamp,
      start: timestamp,
      duration: 0,
      weight: 0,
      discountRate: 0,
      ballot: ethers.constants.AddressZero,
      metadata: packFundingCycleMetadata({ global: { allowSetTerminals: false } }),
    });

    let mockToken = ethers.Wallet.createRandom().address;

    await terminal1.mock.token.returns(mockToken);
    await terminal1.mock.acceptsToken.withArgs(mockToken, PROJECT_ID).returns(true);

    await mockJbOperatorStore.mock.hasPermission
      .withArgs(
        controller.address,
        projectOwner.address,
        PROJECT_ID,
        SET_PRIMARY_TERMINAL_PERMISSION_INDEX,
      )
      .returns(true);

    await expect(
      snowDirectory
        .connect(await impersonateAccount(controller.address))
        .setPrimaryTerminalOf(PROJECT_ID, mockToken, terminal1.address),
    ).to.be.not.reverted;
  });

  it('Cannot set a new primary terminal if the funding cycle prohibits it', async function () {
    const {
      projectOwner,
      addrs,
      snowDirectory,
      mockJbFundingCycleStore,
      mockJbOperatorStore,
      terminal1,
      timestamp,
    } = await setup();
    let caller = addrs[1];

    await mockJbFundingCycleStore.mock.currentOf.withArgs(PROJECT_ID).returns({
      number: 1,
      configuration: timestamp,
      basedOn: timestamp,
      start: timestamp,
      duration: 0,
      weight: 0,
      discountRate: 0,
      ballot: ethers.constants.AddressZero,
      metadata: packFundingCycleMetadata({ global: { allowSetTerminals: false } }),
    });

    let mockToken = ethers.Wallet.createRandom().address;
    await terminal1.mock.token.returns(mockToken);
    await terminal1.mock.acceptsToken.withArgs(mockToken, PROJECT_ID).returns(true);

    await mockJbOperatorStore.mock.hasPermission
      .withArgs(
        caller.address,
        projectOwner.address,
        PROJECT_ID,
        SET_PRIMARY_TERMINAL_PERMISSION_INDEX,
      )
      .returns(true);

    await expect(
      snowDirectory.connect(caller).setPrimaryTerminalOf(PROJECT_ID, mockToken, terminal1.address),
    ).to.be.revertedWith(errors.SET_TERMINALS_NOT_ALLOWED);
  });

  it('Should set a primary terminal if the funding cycle prohibits it but terminals is already added', async function () {
    const {
      projectOwner,
      addrs,
      controller,
      snowDirectory,
      mockJbFundingCycleStore,
      mockJbOperatorStore,
      terminal1,
      terminal2,
      timestamp,
    } = await setup();

    await snowDirectory
      .connect(projectOwner)
      .setTerminalsOf(PROJECT_ID, [terminal1.address, terminal2.address]);

    await mockJbFundingCycleStore.mock.currentOf.withArgs(PROJECT_ID).returns({
      number: 1,
      configuration: timestamp,
      basedOn: timestamp,
      start: timestamp,
      duration: 0,
      weight: 0,
      discountRate: 0,
      ballot: ethers.constants.AddressZero,
      metadata: packFundingCycleMetadata({ global: { allowSetTerminals: false } }),
    });

    let mockToken = ethers.Wallet.createRandom().address;
    await terminal1.mock.token.returns(mockToken);
    await terminal1.mock.acceptsToken.withArgs(mockToken, PROJECT_ID).returns(true);

    await mockJbOperatorStore.mock.hasPermission
      .withArgs(
        controller.address,
        projectOwner.address,
        PROJECT_ID,
        SET_PRIMARY_TERMINAL_PERMISSION_INDEX,
      )
      .returns(true);

    await expect(
      snowDirectory
        .connect(projectOwner)
        .setPrimaryTerminalOf(PROJECT_ID, mockToken, terminal1.address),
    ).to.be.not.reverted;
  });

  it(`Can't set primary terminal if caller is not project owner and does not have permission`, async function () {
    const { projectOwner, addrs, snowDirectory, mockJbOperatorStore, terminal1 } = await setup();
    let caller = addrs[1];

    let mockToken = ethers.Wallet.createRandom().address;
    await terminal1.mock.token.returns(mockToken);
    await terminal1.mock.acceptsToken.withArgs(mockToken, PROJECT_ID).returns(true);

    await mockJbOperatorStore.mock.hasPermission
      .withArgs(
        caller.address,
        projectOwner.address,
        PROJECT_ID,
        SET_PRIMARY_TERMINAL_PERMISSION_INDEX,
      )
      .returns(false);

    await expect(
      snowDirectory.connect(caller).setPrimaryTerminalOf(PROJECT_ID, mockToken, terminal1.address),
    ).to.be.reverted;
  });

  it('Should set multiple terminals for the same project with the same token', async function () {
    const { projectOwner, snowDirectory, terminal1, terminal2 } = await setup();

    let token = ethers.Wallet.createRandom().address;
    await terminal1.mock.token.returns(token);
    await terminal1.mock.acceptsToken.withArgs(token, PROJECT_ID).returns(true);

    await terminal2.mock.token.returns(token);
    await terminal2.mock.acceptsToken.withArgs(token, PROJECT_ID).returns(true);

    let terminals = [terminal1.address, terminal2.address];
    await snowDirectory.connect(projectOwner).setTerminalsOf(PROJECT_ID, terminals);

    await snowDirectory
      .connect(projectOwner)
      .setPrimaryTerminalOf(PROJECT_ID, token, terminal1.address);
    expect(await snowDirectory.connect(projectOwner).primaryTerminalOf(PROJECT_ID, token)).to.equal(
      terminal1.address,
    );

    await snowDirectory
      .connect(projectOwner)
      .setPrimaryTerminalOf(PROJECT_ID, token, terminal2.address);
    expect(await snowDirectory.connect(projectOwner).primaryTerminalOf(PROJECT_ID, token)).to.equal(
      terminal2.address,
    );
  });

  it('Cannot set primary terminal if the terminal does not accept the token', async function () {
    const { projectOwner, snowDirectory, terminal1 } = await setup();

    let initialTerminals = [...(await snowDirectory.connect(projectOwner).terminalsOf(PROJECT_ID))];
    expect(initialTerminals.length).to.equal(0);

    const terminal1TokenAddress = ethers.Wallet.createRandom().address;
    await terminal1.mock.token.returns(terminal1TokenAddress);
    await terminal1.mock.acceptsToken.withArgs(terminal1TokenAddress, PROJECT_ID).returns(false);

    await expect(
      snowDirectory
        .connect(projectOwner)
        .setPrimaryTerminalOf(PROJECT_ID, terminal1TokenAddress, terminal1.address),
    ).to.be.revertedWith(errors.TOKEN_NOT_ACCEPTED);

    // Terminals shouldn't have changed
    let resultTerminals = [...(await snowDirectory.connect(projectOwner).terminalsOf(PROJECT_ID))];
    resultTerminals.sort();

    expect(resultTerminals).to.eql(initialTerminals);
  });
});
