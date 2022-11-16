import { expect } from 'chai';
import { ethers } from 'hardhat';

import { deployMockContract } from '@ethereum-waffle/mock-contract';
import { impersonateAccount, packFundingCycleMetadata } from '../helpers/utils';

import snowFundingCycleStore from '../../artifacts/contracts/SNOWFundingCycleStore.sol/SNOWFundingCycleStore.json';
import snowOperatoreStore from '../../artifacts/contracts/SNOWOperatorStore.sol/SNOWOperatorStore.json';
import snowController from '../../artifacts/contracts/interfaces/ISNOWController.sol/ISNOWController.json';
import snowProjects from '../../artifacts/contracts/SNOWProjects.sol/SNOWProjects.json';
import errors from '../helpers/errors.json';

describe('SNOWDirectory::setControllerOf(...)', function () {
  const PROJECT_ID = 1;

  let SET_CONTROLLER_PERMISSION_INDEX;

  before(async function () {
    let snowOperationsFactory = await ethers.getContractFactory('SNOWOperations');
    let snowOperations = await snowOperationsFactory.deploy();

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

    let controller1 = await deployMockContract(projectOwner, snowController.abi);
    let controller2 = await deployMockContract(projectOwner, snowController.abi);

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
      metadata: packFundingCycleMetadata(),
    });

    return {
      projectOwner,
      deployer,
      addrs,
      snowDirectory,
      mockJbFundingCycleStore,
      mockJbProjects,
      mockJbOperatorStore,
      controller1,
      controller2,
      timestamp,
    };
  }

  // --- set ---

  it('Should set controller and emit event if caller is project owner', async function () {
    const { projectOwner, snowDirectory, mockJbProjects, controller1 } = await setup();

    await mockJbProjects.mock.count.returns(PROJECT_ID);

    let tx = await snowDirectory
      .connect(projectOwner)
      .setControllerOf(PROJECT_ID, controller1.address);

    await expect(tx)
      .to.emit(snowDirectory, 'SetController')
      .withArgs(PROJECT_ID, controller1.address, projectOwner.address);

    let controller = await snowDirectory.connect(projectOwner).controllerOf(PROJECT_ID);
    expect(controller).to.equal(controller1.address);
  });

  it('Should set controller if caller is not project owner but has permission', async function () {
    const { projectOwner, addrs, snowDirectory, mockJbProjects, mockJbOperatorStore, controller1 } =
      await setup();
    let caller = addrs[1];

    // Initialize mock methods to give permission to caller
    await mockJbProjects.mock.count.returns(PROJECT_ID);
    await mockJbOperatorStore.mock.hasPermission
      .withArgs(caller.address, projectOwner.address, PROJECT_ID, SET_CONTROLLER_PERMISSION_INDEX)
      .returns(true);

    await expect(snowDirectory.connect(caller).setControllerOf(PROJECT_ID, controller1.address)).to
      .not.be.reverted;
  });

  it('Should set controller if caller is current controller', async function () {
    const { projectOwner, snowDirectory, mockJbProjects, controller1, controller2 } = await setup();

    await mockJbProjects.mock.count.returns(PROJECT_ID);

    await snowDirectory.connect(projectOwner).setControllerOf(PROJECT_ID, controller1.address);

    let controller = await snowDirectory.connect(projectOwner).controllerOf(PROJECT_ID);
    expect(controller).to.equal(controller1.address);

    let caller = await impersonateAccount(controller1.address);

    await snowDirectory.connect(caller).setControllerOf(PROJECT_ID, controller2.address);

    controller = await snowDirectory.connect(projectOwner).controllerOf(PROJECT_ID);
    expect(controller).to.equal(controller2.address);
  });

  it('Should set controller if caller is allowed to set first controller and project has no controller yet', async function () {
    const {
      deployer,
      projectOwner,
      snowDirectory,
      mockJbProjects,
      mockJbOperatorStore,
      controller1,
      controller2,
    } = await setup();

    let caller = await impersonateAccount(controller1.address);

    // Initialize mock methods to reject permission to controllerSigner
    await mockJbProjects.mock.count.returns(PROJECT_ID);
    await mockJbOperatorStore.mock.hasPermission
      .withArgs(caller.address, projectOwner.address, PROJECT_ID, SET_CONTROLLER_PERMISSION_INDEX)
      .returns(false);

    await mockJbOperatorStore.mock.hasPermission
      .withArgs(caller.address, projectOwner.address, 0, SET_CONTROLLER_PERMISSION_INDEX)
      .returns(false);

    await snowDirectory.connect(deployer).setIsAllowedToSetFirstController(caller.address, true);

    await expect(snowDirectory.connect(caller).setControllerOf(PROJECT_ID, controller2.address)).to
      .not.be.reverted;
  });

  it('Cannot set controller if caller is not allowed to set first controller and project has no controller yet', async function () {
    const {
      projectOwner,
      snowDirectory,
      mockJbProjects,
      mockJbOperatorStore,
      controller1,
      controller2,
    } = await setup();

    let caller = await impersonateAccount(controller1.address);

    // Initialize mock methods to reject permission to controllerSigner
    await mockJbProjects.mock.count.returns(PROJECT_ID);
    await mockJbOperatorStore.mock.hasPermission
      .withArgs(caller.address, projectOwner.address, PROJECT_ID, SET_CONTROLLER_PERMISSION_INDEX)
      .returns(false);

    await mockJbOperatorStore.mock.hasPermission
      .withArgs(caller.address, projectOwner.address, 0, SET_CONTROLLER_PERMISSION_INDEX)
      .returns(false);

    await expect(snowDirectory.connect(caller).setControllerOf(PROJECT_ID, controller2.address)).to.be
      .reverted;
  });

  it('Cannot set controller if caller is allowed to set first controller but project has already a first controller', async function () {
    const { deployer, projectOwner, snowDirectory, mockJbProjects, addrs, controller1, controller2 } =
      await setup();

    // Initialize mock methods to reject permission to controllerSigner
    await mockJbProjects.mock.count.returns(PROJECT_ID);

    const caller = addrs[0];

    await snowDirectory.connect(deployer).setIsAllowedToSetFirstController(caller.address, true);

    await snowDirectory.connect(caller).setControllerOf(PROJECT_ID, controller1.address);

    await expect(snowDirectory.connect(caller).setControllerOf(PROJECT_ID, controller2.address)).to.be
      .reverted;
  });

  it(`Can't set if project id does not exist`, async function () {
    const { projectOwner, snowDirectory, mockJbProjects, controller1 } = await setup();

    await mockJbProjects.mock.count.returns(PROJECT_ID - 1);

    await expect(
      snowDirectory.connect(projectOwner).setControllerOf(PROJECT_ID, controller1.address),
    ).to.be.revertedWith(errors.INVALID_PROJECT_ID_IN_DIRECTORY);
  });

  // --- change ---

  it('Should change controller and emit event if caller is the current controller', async function () {
    const { projectOwner, snowDirectory, mockJbProjects, controller1, controller2 } = await setup();

    await mockJbProjects.mock.count.returns(PROJECT_ID);

    await snowDirectory.connect(projectOwner).setControllerOf(PROJECT_ID, controller1.address);

    let tx = await snowDirectory
      .connect(await impersonateAccount(controller1.address))
      .setControllerOf(PROJECT_ID, controller2.address);

    await expect(tx)
      .to.emit(snowDirectory, 'SetController')
      .withArgs(PROJECT_ID, controller2.address, controller1.address);

    let controller = await snowDirectory.connect(projectOwner).controllerOf(PROJECT_ID);
    expect(controller).to.equal(controller2.address);
  });

  it('Cannot change controller if funding cycle prohibit it, if the caller is the current controller', async function () {
    const {
      projectOwner,
      snowDirectory,
      mockJbFundingCycleStore,
      mockJbProjects,
      controller1,
      controller2,
      timestamp,
    } = await setup();

    await mockJbFundingCycleStore.mock.currentOf.withArgs(PROJECT_ID).returns({
      number: 1,
      configuration: timestamp,
      basedOn: timestamp,
      start: timestamp,
      duration: 0,
      weight: 0,
      discountRate: 0,
      ballot: ethers.constants.AddressZero,
      metadata: packFundingCycleMetadata({ allowSetController: false }),
    });

    await mockJbProjects.mock.count.returns(PROJECT_ID);

    await snowDirectory.connect(projectOwner).setControllerOf(PROJECT_ID, controller1.address);

    await expect(
      snowDirectory.connect(projectOwner).setControllerOf(PROJECT_ID, controller2.address),
    ).to.be.revertedWith(errors.SET_CONTROLLER_NOT_ALLOWED);

    let controller = await snowDirectory.connect(projectOwner).controllerOf(PROJECT_ID);
    expect(controller).to.equal(controller1.address);
  });
});
