import { expect } from 'chai';
import { ethers } from 'hardhat';

import { deployMockContract } from '@ethereum-waffle/mock-contract';

import errors from '../helpers/errors.json';
import snowFundingCycleStore from '../../artifacts/contracts/SNOWFundingCycleStore.sol/SNOWFundingCycleStore.json';
import snowController from '../../artifacts/contracts/interfaces/ISNOWController.sol/ISNOWController.json';
import snowOperatoreStore from '../../artifacts/contracts/SNOWOperatorStore.sol/SNOWOperatorStore.json';
import snowProjects from '../../artifacts/contracts/SNOWProjects.sol/SNOWProjects.json';
import snowTerminal from '../../artifacts/contracts/abstract/SNOWPayoutRedemptionPaymentTerminal.sol/SNOWPayoutRedemptionPaymentTerminal.json';
import { impersonateAccount, packFundingCycleMetadata } from '../helpers/utils';

describe('SNOWDirectory::setTerminalsOf(...)', function () {
  const PROJECT_ID = 1;
  const ADDRESS_TOKEN_3 = ethers.Wallet.createRandom().address;
  let SET_TERMINALS_PERMISSION_INDEX;
  let SET_CONTROLLER_PERMISSION_INDEX;

  before(async function () {
    let snowOperationsFactory = await ethers.getContractFactory('SNOWOperations');
    let snowOperations = await snowOperationsFactory.deploy();

    SET_TERMINALS_PERMISSION_INDEX = await snowOperations.SET_TERMINALS();
    SET_CONTROLLER_PERMISSION_INDEX = await snowOperations.SET_CONTROLLER();
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
    let terminal3 = await deployMockContract(projectOwner, snowTerminal.abi);

    const tokenTerminal1 = ethers.Wallet.createRandom().address;
    await terminal1.mock.token.returns(tokenTerminal1);
    await terminal1.mock.acceptsToken.withArgs(tokenTerminal1, PROJECT_ID).returns(true);

    const tokenTerminal2 = ethers.Wallet.createRandom().address;
    await terminal2.mock.token.returns(tokenTerminal2);
    await terminal2.mock.acceptsToken.withArgs(tokenTerminal2, PROJECT_ID).returns(true);

    await mockJbProjects.mock.ownerOf.withArgs(PROJECT_ID).returns(projectOwner.address);
    await mockJbOperatorStore.mock.hasPermission
      .withArgs(
        projectOwner.address,
        projectOwner.address,
        PROJECT_ID,
        SET_TERMINALS_PERMISSION_INDEX,
      )
      .returns(true);

    await mockJbProjects.mock.count.returns(PROJECT_ID);

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

    return {
      projectOwner,
      controller,
      deployer,
      addrs,
      snowDirectory,
      timestamp,
      terminal1,
      terminal2,
      terminal3,
      mockJbFundingCycleStore,
      mockJbProjects,
      mockJbOperatorStore,
    };
  }

  it('Should add terminals and emit events if caller is project owner', async function () {
    const { projectOwner, snowDirectory, terminal1, terminal2 } = await setup();

    const terminals = [terminal1.address, terminal2.address];

    await expect(snowDirectory.connect(projectOwner).setTerminalsOf(PROJECT_ID, terminals))
      .to.emit(snowDirectory, 'SetTerminals')
      .withArgs(PROJECT_ID, terminals, projectOwner.address);
  });

  it('Should add terminals and return the first compatible terminal if the previous primary terminal is not part of the new ones', async function () {
    const { projectOwner, snowDirectory, terminal1, terminal2, terminal3 } = await setup();

    const terminals = [terminal1.address, terminal2.address];

    await terminal3.mock.token.returns(ADDRESS_TOKEN_3);
    await terminal3.mock.acceptsToken.withArgs(ADDRESS_TOKEN_3, PROJECT_ID).returns(true);

    expect(
      await snowDirectory
        .connect(projectOwner)
        .setPrimaryTerminalOf(PROJECT_ID, ADDRESS_TOKEN_3, terminal3.address),
    )
      .to.emit(snowDirectory, 'SetPrimaryTerminal')
      .withArgs(PROJECT_ID, ADDRESS_TOKEN_3, terminal3.address, projectOwner.address);

    await expect(snowDirectory.connect(projectOwner).setTerminalsOf(PROJECT_ID, terminals)).to.emit(
      snowDirectory,
      'SetTerminals',
    );
    //.withArgs(PROJECT_ID, terminals, projectOwner.address);

    await terminal1.mock.acceptsToken.withArgs(ADDRESS_TOKEN_3, PROJECT_ID).returns(false);
    await terminal2.mock.acceptsToken.withArgs(ADDRESS_TOKEN_3, PROJECT_ID).returns(true);

    expect(await snowDirectory.primaryTerminalOf(PROJECT_ID, ADDRESS_TOKEN_3)).to.equal(
      terminal2.address,
    );
  });

  it('Should add terminals and return address 0 if the previous primary terminal is not part of the new ones and none support the token', async function () {
    const { projectOwner, snowDirectory, terminal1, terminal2, terminal3 } = await setup();

    const terminals = [terminal1.address, terminal2.address];

    await terminal3.mock.token.returns(ADDRESS_TOKEN_3);
    await terminal3.mock.acceptsToken.withArgs(ADDRESS_TOKEN_3, PROJECT_ID).returns(true);

    expect(
      await snowDirectory
        .connect(projectOwner)
        .setPrimaryTerminalOf(PROJECT_ID, ADDRESS_TOKEN_3, terminal3.address),
    )
      .to.emit(snowDirectory, 'SetPrimaryTerminal')
      .withArgs(PROJECT_ID, ADDRESS_TOKEN_3, terminal3.address, projectOwner.address);

    await expect(snowDirectory.connect(projectOwner).setTerminalsOf(PROJECT_ID, terminals)).to.emit(
      snowDirectory,
      'SetTerminals',
    );
    //.withArgs(PROJECT_ID, terminals, projectOwner.address);

    await terminal1.mock.acceptsToken.withArgs(ADDRESS_TOKEN_3, PROJECT_ID).returns(false);
    await terminal2.mock.acceptsToken.withArgs(ADDRESS_TOKEN_3, PROJECT_ID).returns(false);

    expect(await snowDirectory.primaryTerminalOf(PROJECT_ID, ADDRESS_TOKEN_3)).to.equal(
      ethers.constants.AddressZero,
    );
  });

  it('Should add terminals and keep a previous primary terminal if it is included in the new terminals', async function () {
    const { projectOwner, snowDirectory, terminal1, terminal2, terminal3 } = await setup();

    const terminals = [terminal1.address, terminal2.address, terminal3.address];

    await terminal3.mock.token.returns(ADDRESS_TOKEN_3);
    await terminal3.mock.acceptsToken.withArgs(ADDRESS_TOKEN_3, PROJECT_ID).returns(true);

    expect(
      await snowDirectory
        .connect(projectOwner)
        .setPrimaryTerminalOf(PROJECT_ID, ADDRESS_TOKEN_3, terminal3.address),
    )
      .to.emit(snowDirectory, 'SetPrimaryTerminal')
      .withArgs(PROJECT_ID, ADDRESS_TOKEN_3, terminal3.address, projectOwner.address);

    await expect(snowDirectory.connect(projectOwner).setTerminalsOf(PROJECT_ID, terminals)).to.emit(
      snowDirectory,
      'SetTerminals',
    );
    //.withArgs(PROJECT_ID, terminals, projectOwner.address);

    expect(await snowDirectory.primaryTerminalOf(PROJECT_ID, ADDRESS_TOKEN_3)).to.equal(
      terminal3.address,
    );
  });

  it('Should add if caller is controller of the project', async function () {
    const { addrs, projectOwner, snowDirectory, mockJbProjects, mockJbOperatorStore, terminal1 } =
      await setup();
    // Give the project owner permissions to set the controller.
    await mockJbProjects.mock.count.returns(1);
    await mockJbOperatorStore.mock.hasPermission
      .withArgs(
        projectOwner.address,
        projectOwner.address,
        PROJECT_ID,
        SET_CONTROLLER_PERMISSION_INDEX,
      )
      .returns(true);

    let controller = await deployMockContract(addrs[1], snowController.abi);
    let controllerSigner = await impersonateAccount(controller.address);

    await expect(
      snowDirectory.connect(controllerSigner).setTerminalsOf(PROJECT_ID, [terminal1.address]),
    ).to.be.reverted;

    // After the controller has been set, the controller signer should be able to add terminals.
    await snowDirectory.connect(projectOwner).setControllerOf(PROJECT_ID, controller.address);
    await expect(
      snowDirectory.connect(controllerSigner).setTerminalsOf(PROJECT_ID, [terminal1.address]),
    ).to.not.be.reverted;
  });

  it('Should add if caller has permission but is not the project owner', async function () {
    const { addrs, projectOwner, snowDirectory, mockJbOperatorStore, terminal1 } = await setup();
    const caller = addrs[1];

    // Give the caller permission to add terminals.
    await mockJbOperatorStore.mock.hasPermission
      .withArgs(caller.address, projectOwner.address, PROJECT_ID, SET_TERMINALS_PERMISSION_INDEX)
      .returns(true);

    await expect(snowDirectory.connect(caller).setTerminalsOf(PROJECT_ID, [terminal1.address])).to.not
      .be.reverted;
  });

  it('Should add if the funding cycle prohibits it but the caller is the controller', async function () {
    const {
      addrs,
      controller,
      projectOwner,
      snowDirectory,
      mockJbFundingCycleStore,
      mockJbOperatorStore,
      timestamp,
      terminal1,
    } = await setup();

    await snowDirectory.connect(projectOwner).setControllerOf(PROJECT_ID, controller.address);

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

    // Give the caller permission to add terminals.
    await mockJbOperatorStore.mock.hasPermission
      .withArgs(
        controller.address,
        projectOwner.address,
        PROJECT_ID,
        SET_TERMINALS_PERMISSION_INDEX,
      )
      .returns(true);

    await expect(
      snowDirectory
        .connect(await impersonateAccount(controller.address))
        .setTerminalsOf(PROJECT_ID, [terminal1.address]),
    ).to.not.be.reverted;
  });

  it('Cannot add if caller has permission but is not the controller and funding cycle prohibits it', async function () {
    const {
      addrs,
      projectOwner,
      snowDirectory,
      mockJbOperatorStore,
      mockJbFundingCycleStore,
      terminal1,
      timestamp,
    } = await setup();
    const caller = addrs[1];

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

    // Give the caller permission to add terminals.
    await mockJbOperatorStore.mock.hasPermission
      .withArgs(caller.address, projectOwner.address, PROJECT_ID, SET_TERMINALS_PERMISSION_INDEX)
      .returns(true);

    await expect(
      snowDirectory.connect(caller).setTerminalsOf(PROJECT_ID, [terminal1.address]),
    ).to.be.revertedWith(errors.SET_TERMINALS_NOT_ALLOWED);
  });

  it("Can't add with duplicates", async function () {
    const { projectOwner, snowDirectory, terminal1 } = await setup();

    await expect(
      snowDirectory
        .connect(projectOwner)
        .setTerminalsOf(PROJECT_ID, [terminal1.address, terminal1.address]),
    ).to.be.revertedWith(errors.DUPLICATE_TERMINALS);
  });

  it("Can't add if caller does not have permission", async function () {
    const { addrs, projectOwner, snowDirectory, mockJbProjects, mockJbOperatorStore, terminal1 } =
      await setup();
    const caller = addrs[1];

    // Ensure the caller does not have permissions to add terminals.
    await mockJbProjects.mock.ownerOf.withArgs(PROJECT_ID).returns(projectOwner.address);
    await mockJbOperatorStore.mock.hasPermission
      .withArgs(caller.address, projectOwner.address, PROJECT_ID, SET_TERMINALS_PERMISSION_INDEX)
      .returns(false);

    await expect(snowDirectory.connect(caller).setTerminalsOf(PROJECT_ID, [terminal1.address])).to.be
      .reverted;
  });
});
