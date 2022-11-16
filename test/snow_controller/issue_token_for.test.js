import { expect } from 'chai';
import { ethers } from 'hardhat';
import { deployMockContract } from '@ethereum-waffle/mock-contract';
import errors from '../helpers/errors.json';

import snowDirectory from '../../artifacts/contracts/SNOWDirectory.sol/SNOWDirectory.json';
import snowFundingCycleStore from '../../artifacts/contracts/SNOWFundingCycleStore.sol/SNOWFundingCycleStore.json';
import snowOperatoreStore from '../../artifacts/contracts/SNOWOperatorStore.sol/SNOWOperatorStore.json';
import snowProjects from '../../artifacts/contracts/SNOWProjects.sol/SNOWProjects.json';
import snowSplitsStore from '../../artifacts/contracts/SNOWSplitsStore.sol/SNOWSplitsStore.json';
import snowToken from '../../artifacts/contracts/SNOWToken.sol/SNOWToken.json';
import snowTokenStore from '../../artifacts/contracts/SNOWTokenStore.sol/SNOWTokenStore.json';

describe('SNOWController::issueTokenFor(...)', function () {
  const PROJECT_ID = 1;
  const NAME = 'TestTokenDAO';
  const SYMBOL = 'TEST';

  let ISSUE_PERMISSION_INDEX;

  before(async function () {
    let snowOperationsFactory = await ethers.getContractFactory('SNOWOperations');
    let snowOperations = await snowOperationsFactory.deploy();

    ISSUE_PERMISSION_INDEX = await snowOperations.ISSUE();
  });

  async function setup() {
    let [deployer, projectOwner, ...addrs] = await ethers.getSigners();

    let [
      mockJbDirectory,
      mockJbFundingCycleStore,
      mockJbOperatorStore,
      mockJbProjects,
      mockJbSplitsStore,
      mockJbToken,
      mockJbTokenStore,
    ] = await Promise.all([
      deployMockContract(deployer, snowDirectory.abi),
      deployMockContract(deployer, snowFundingCycleStore.abi),
      deployMockContract(deployer, snowOperatoreStore.abi),
      deployMockContract(deployer, snowProjects.abi),
      deployMockContract(deployer, snowSplitsStore.abi),
      deployMockContract(deployer, snowToken.abi),
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

    await mockJbTokenStore.mock.issueFor
      .withArgs(PROJECT_ID, NAME, SYMBOL)
      .returns(mockJbToken.address);

    await mockJbProjects.mock.ownerOf.withArgs(PROJECT_ID).returns(projectOwner.address);

    return {
      projectOwner,
      deployer,
      addrs,
      snowController,
      mockJbTokenStore,
      mockJbToken,
      mockJbOperatorStore,
    };
  }

  it(`Should deploy an ERC-20 token contract if caller is project owner`, async function () {
    const { projectOwner, snowController, mockJbToken } = await setup();
    let returnedAddress = await snowController
      .connect(projectOwner)
      .callStatic.issueTokenFor(PROJECT_ID, NAME, SYMBOL);
    expect(returnedAddress).to.equal(mockJbToken.address);
  });

  it(`Should deploy an ERC-20 token contract if caller is authorized`, async function () {
    const { addrs, projectOwner, snowController, mockJbToken, mockJbOperatorStore } = await setup();
    let caller = addrs[0];

    await mockJbOperatorStore.mock.hasPermission
      .withArgs(caller.address, projectOwner.address, PROJECT_ID, ISSUE_PERMISSION_INDEX)
      .returns(true);

    let returnedAddress = await snowController
      .connect(caller)
      .callStatic.issueTokenFor(PROJECT_ID, NAME, SYMBOL);
    expect(returnedAddress).to.equal(mockJbToken.address);
  });

  it(`Can't deploy an ERC-20 token contract if caller is not authorized`, async function () {
    const { addrs, projectOwner, snowController, mockJbToken, mockJbOperatorStore } = await setup();
    let caller = addrs[0];

    await mockJbOperatorStore.mock.hasPermission
      .withArgs(caller.address, projectOwner.address, PROJECT_ID, ISSUE_PERMISSION_INDEX)
      .returns(false);

    await mockJbOperatorStore.mock.hasPermission
      .withArgs(caller.address, projectOwner.address, 0, ISSUE_PERMISSION_INDEX)
      .returns(false);

    await expect(
      snowController.connect(caller).callStatic.issueTokenFor(PROJECT_ID, NAME, SYMBOL),
    ).to.be.revertedWith(errors.UNAUTHORIZED);
  });
});
