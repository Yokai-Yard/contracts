import { expect } from 'chai';
import { ethers } from 'hardhat';

import { deployMockContract } from '@ethereum-waffle/mock-contract';

import snowOperatoreStore from '../../artifacts/contracts/SNOWOperatorStore.sol/SNOWOperatorStore.json';

describe('SNOWProjects::setMetadataOf(...)', function () {
  const METADATA_CID = '';
  const METADATA_DOMAIN = 1234;
  const METADATA_CID_2 = 'ipfs://randommetadatacidipsaddress';
  const METADATA_DOMAIN_2 = 23435;
  const PROJECT_ID_1 = 1;

  let SET_METADATA_PERMISSION_INDEX;

  before(async function () {
    let snowOperationsFactory = await ethers.getContractFactory('SNOWOperations');
    let snowOperations = await snowOperationsFactory.deploy();

    SET_METADATA_PERMISSION_INDEX = await snowOperations.SET_METADATA();
  });

  async function setup() {
    let [deployer, projectOwner, ...addrs] = await ethers.getSigners();

    let mockJbOperatorStore = await deployMockContract(deployer, snowOperatoreStore.abi);
    let snowProjectsFactory = await ethers.getContractFactory('SNOWProjects');
    let snowProjectsStore = await snowProjectsFactory.deploy(mockJbOperatorStore.address);

    return {
      projectOwner,
      deployer,
      addrs,
      snowProjectsStore,
      mockJbOperatorStore,
    };
  }

  it(`Should set MetadataCid on project by owner and emit SetMetadata`, async function () {
    const { projectOwner, deployer, snowProjectsStore } = await setup();

    await snowProjectsStore
      .connect(deployer)
      .createFor(projectOwner.address, [METADATA_CID, METADATA_DOMAIN]);

    let tx = await snowProjectsStore
      .connect(projectOwner)
      .setMetadataOf(PROJECT_ID_1, [METADATA_CID_2, METADATA_DOMAIN_2]);

    let storedMetadataCid = await snowProjectsStore
      .connect(deployer)
      .metadataContentOf(PROJECT_ID_1, METADATA_DOMAIN_2);
    await expect(storedMetadataCid).to.equal(METADATA_CID_2);

    await expect(tx)
      .to.emit(snowProjectsStore, 'SetMetadata')
      .withArgs(PROJECT_ID_1, [METADATA_CID_2, METADATA_DOMAIN_2], projectOwner.address);
  });

  it(`Should set MetadataCid on project if caller is not owner but has permission`, async function () {
    const { projectOwner, deployer, addrs, snowProjectsStore, mockJbOperatorStore } = await setup();

    await snowProjectsStore
      .connect(deployer)
      .createFor(projectOwner.address, [METADATA_CID, METADATA_DOMAIN]);

    await mockJbOperatorStore.mock.hasPermission
      .withArgs(addrs[1].address, projectOwner.address, PROJECT_ID_1, SET_METADATA_PERMISSION_INDEX)
      .returns(true);

    await expect(snowProjectsStore.connect(addrs[1]).setMetadataOf(PROJECT_ID_1, METADATA_CID_2)).to
      .not.be.reverted;
  });

  it(`Can't set MetadataCid on project if caller is not owner and doesn't have permission`, async function () {
    const { projectOwner, deployer, addrs, snowProjectsStore, mockJbOperatorStore } = await setup();

    await snowProjectsStore
      .connect(deployer)
      .createFor(projectOwner.address, [METADATA_CID, METADATA_DOMAIN]);

    await mockJbOperatorStore.mock.hasPermission
      .withArgs(addrs[1].address, projectOwner.address, PROJECT_ID_1, SET_METADATA_PERMISSION_INDEX)
      .returns(false);

    await expect(
      snowProjectsStore
        .connect(addrs[1])
        .setMetadataOf(PROJECT_ID_1, [METADATA_CID_2, METADATA_DOMAIN_2]),
    ).to.be.reverted;
  });
});
