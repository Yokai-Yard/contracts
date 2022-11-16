import { expect } from 'chai';
import { ethers } from 'hardhat';
import { deployMockContract } from '@ethereum-waffle/mock-contract';
import { packFundingCycleMetadata } from '../helpers/utils';
import errors from '../helpers/errors.json';

import JbController from '../../artifacts/contracts/SNOWController.sol/SNOWController.json';
import snowDirectory from '../../artifacts/contracts/SNOWDirectory.sol/SNOWDirectory.json';
import snowFundingCycleStore from '../../artifacts/contracts/SNOWFundingCycleStore.sol/SNOWFundingCycleStore.json';
import snowOperatoreStore from '../../artifacts/contracts/SNOWOperatorStore.sol/SNOWOperatorStore.json';
import snowProjects from '../../artifacts/contracts/SNOWProjects.sol/SNOWProjects.json';
import snowSplitsStore from '../../artifacts/contracts/SNOWSplitsStore.sol/SNOWSplitsStore.json';
import snowTokenStore from '../../artifacts/contracts/SNOWTokenStore.sol/SNOWTokenStore.json';

describe('SNOWController::migrate(...)', function () {
  const PROJECT_ID = 1;
  const TOTAL_SUPPLY = 20000;
  let MIGRATE_CONTROLLER_INDEX;

  before(async function () {
    let snowOperationsFactory = await ethers.getContractFactory('SNOWOperations');
    let snowOperations = await snowOperationsFactory.deploy();

    MIGRATE_CONTROLLER_INDEX = await snowOperations.MIGRATE_CONTROLLER();
  });

  async function setup() {
    let [deployer, projectOwner, caller, ...addrs] = await ethers.getSigners();

    const blockNum = await ethers.provider.getBlockNumber();
    const block = await ethers.provider.getBlock(blockNum);
    const timestamp = block.timestamp;

    let [
      mockJbController,
      mockJbDirectory,
      mockJbFundingCycleStore,
      mockJbOperatorStore,
      mockJbProjects,
      mockJbSplitsStore,
      mockJbTokenStore,
    ] = await Promise.all([
      deployMockContract(deployer, JbController.abi),
      deployMockContract(deployer, snowDirectory.abi),
      deployMockContract(deployer, snowFundingCycleStore.abi),
      deployMockContract(deployer, snowOperatoreStore.abi),
      deployMockContract(deployer, snowProjects.abi),
      deployMockContract(deployer, snowSplitsStore.abi),
      deployMockContract(deployer, snowTokenStore.abi),
    ]);

    let snowControllerFactory = await ethers.getContractFactory(
      'contracts/SNOWController.sol:SNOWController',
    );
    let snowController = await snowControllerFactory.deploy(
      mockJbOperatorStore.address,
      mockJbProjects.address,
      mockJbDirectory.address,
      mockJbFundingCycleStore.address,
      mockJbTokenStore.address,
      mockJbSplitsStore.address,
    );

    await mockJbProjects.mock.ownerOf.withArgs(PROJECT_ID).returns(projectOwner.address);

    await mockJbDirectory.mock.controllerOf.withArgs(PROJECT_ID).returns(snowController.address);

    await mockJbDirectory.mock.setControllerOf
      .withArgs(PROJECT_ID, mockJbController.address)
      .returns();

    await mockJbTokenStore.mock.totalSupplyOf.withArgs(PROJECT_ID).returns(TOTAL_SUPPLY);

    await mockJbController.mock.prepForMigrationOf
      .withArgs(PROJECT_ID, snowController.address)
      .returns();

    await mockJbFundingCycleStore.mock.currentOf.withArgs(PROJECT_ID).returns({
      // mock SNOWFundingCycle obj
      number: 1,
      configuration: timestamp,
      basedOn: timestamp,
      start: timestamp,
      duration: 0,
      weight: 0,
      discountRate: 0,
      ballot: ethers.constants.AddressZero,
      metadata: packFundingCycleMetadata({ allowControllerMigration: 1 }),
    });

    return {
      deployer,
      projectOwner,
      caller,
      addrs,
      snowController,
      mockJbDirectory,
      mockJbTokenStore,
      mockJbController,
      mockJbOperatorStore,
      mockJbFundingCycleStore,
      timestamp,
    };
  }

  it(`Should mint all reserved token and migrate controller if caller is project's current controller`, async function () {
    const { snowController, projectOwner, mockJbController, timestamp } = await setup();

    let tx = snowController.connect(projectOwner).migrate(PROJECT_ID, mockJbController.address);

    await expect(tx)
      .to.emit(snowController, 'DistributeReservedTokens')
      .withArgs(
        /*fundingCycleConfiguration=*/ timestamp,
        /*fundingCycleNumber=*/ 1,
        /*projectId=*/ PROJECT_ID,
        /*projectOwner=*/ projectOwner.address,
        /*count=*/ 0,
        /*leftoverTokenCount=*/ 0,
        /*memo=*/ '',
        /*caller=*/ projectOwner.address,
      )
      .and.to.emit(snowController, 'Migrate')
      .withArgs(PROJECT_ID, mockJbController.address, projectOwner.address);

    expect(await snowController.reservedTokenBalanceOf(PROJECT_ID, 10000)).to.equal(0);
  });

  it(`Should mint all reserved token and migrate controller if caller is authorized`, async function () {
    const { snowController, projectOwner, caller, mockJbController, mockJbOperatorStore, timestamp } =
      await setup();

    await mockJbOperatorStore.mock.hasPermission
      .withArgs(caller.address, projectOwner.address, PROJECT_ID, MIGRATE_CONTROLLER_INDEX)
      .returns(true);

    let tx = snowController.connect(caller).migrate(PROJECT_ID, mockJbController.address);

    await expect(tx)
      .to.emit(snowController, 'DistributeReservedTokens')
      .withArgs(timestamp, 1, PROJECT_ID, projectOwner.address, 0, 0, '', caller.address)
      .and.to.emit(snowController, 'Migrate')
      .withArgs(PROJECT_ID, mockJbController.address, caller.address);

    expect(await snowController.reservedTokenBalanceOf(PROJECT_ID, 10000)).to.equal(0);
  });

  it(`Should migrate controller without minting if there is no reserved token`, async function () {
    const { snowController, projectOwner, mockJbController, mockJbTokenStore } = await setup();

    await mockJbTokenStore.mock.totalSupplyOf.withArgs(PROJECT_ID).returns(0);

    let tx = snowController.connect(projectOwner).migrate(PROJECT_ID, mockJbController.address);

    await expect(tx)
      .to.emit(snowController, 'Migrate')
      .withArgs(PROJECT_ID, mockJbController.address, projectOwner.address)
      .and.to.not.emit(snowController, 'DistributeReservedTokens');

    expect(await snowController.reservedTokenBalanceOf(PROJECT_ID, 10000)).to.equal(0);
  });

  it(`Can't migrate controller if caller is not the owner nor is authorized`, async function () {
    const { snowController, projectOwner, caller, mockJbController, mockJbOperatorStore, timestamp } =
      await setup();

    await mockJbOperatorStore.mock.hasPermission
      .withArgs(caller.address, projectOwner.address, PROJECT_ID, MIGRATE_CONTROLLER_INDEX)
      .returns(false);

    await mockJbOperatorStore.mock.hasPermission
      .withArgs(caller.address, projectOwner.address, 0, MIGRATE_CONTROLLER_INDEX)
      .returns(false);

    await expect(
      snowController.connect(caller).migrate(PROJECT_ID, mockJbController.address),
    ).to.be.revertedWith('UNAUTHORIZED()');
  });

  it(`Can't migrate if migration is not initiated via the current controller`, async function () {
    const { deployer, snowController, projectOwner, mockJbDirectory, mockJbController } =
      await setup();

    let mockCurrentController = await deployMockContract(deployer, JbController.abi);

    await mockJbDirectory.mock.controllerOf
      .withArgs(PROJECT_ID)
      .returns(mockCurrentController.address);

    await expect(
      snowController.connect(projectOwner).migrate(PROJECT_ID, mockJbController.address),
    ).to.be.revertedWith(errors.NOT_CURRENT_CONTROLLER);
  });

  it(`Can't migrate if migration is not allowed in funding cycle`, async function () {
    const { snowController, projectOwner, mockJbFundingCycleStore, mockJbController, timestamp } =
      await setup();

    await mockJbFundingCycleStore.mock.currentOf.withArgs(PROJECT_ID).returns({
      number: 1,
      configuration: timestamp,
      basedOn: timestamp,
      start: timestamp,
      duration: 0,
      weight: 0,
      discountRate: 0,
      ballot: ethers.constants.AddressZero,
      metadata: packFundingCycleMetadata({ allowControllerMigration: 0 }),
    });

    await expect(
      snowController.connect(projectOwner).migrate(PROJECT_ID, mockJbController.address),
    ).to.be.revertedWith(errors.MIGRATION_NOT_ALLOWED);
  });
});
