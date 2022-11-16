import { expect } from 'chai';
import { ethers } from 'hardhat';

describe('SNOWProjects::createFor(...)', function () {
  const METADATA_CID = 'QmThsKQpFBQicz3t3SU9rRz3GV81cwjnWsBBLxzznRNvpa';
  const METADATA_DOMAIN = 1234;
  const PROJECT_ID_1 = 1;
  const PROJECT_ID_2 = 2;

  async function setup() {
    let [deployer, projectOwner, ...addrs] = await ethers.getSigners();

    let snowOperatorStoreFactory = await ethers.getContractFactory('SNOWOperatorStore');
    let snowOperatorStore = await snowOperatorStoreFactory.deploy();

    let snowProjectsFactory = await ethers.getContractFactory('SNOWProjects');
    let snowProjectsStore = await snowProjectsFactory.deploy(snowOperatorStore.address);

    return {
      projectOwner,
      deployer,
      addrs,
      snowProjectsStore,
    };
  }

  it(`Should create a project and emit Create`, async function () {
    const { projectOwner, deployer, snowProjectsStore } = await setup();

    let tx = await snowProjectsStore
      .connect(deployer)
      .createFor(projectOwner.address, [METADATA_CID, METADATA_DOMAIN]);

    let storedMetadataCid = await snowProjectsStore
      .connect(deployer)
      .metadataContentOf(PROJECT_ID_1, METADATA_DOMAIN);

    await expect(storedMetadataCid).to.equal(METADATA_CID);

    await expect(tx)
      .to.emit(snowProjectsStore, 'Create')
      .withArgs(
        PROJECT_ID_1,
        projectOwner.address,
        [METADATA_CID, METADATA_DOMAIN],
        deployer.address,
      );
  });

  it(`Should create two projects and count to be 2 and emit Create`, async function () {
    const { projectOwner, deployer, snowProjectsStore } = await setup();

    await snowProjectsStore
      .connect(deployer)
      .createFor(projectOwner.address, [METADATA_CID, METADATA_DOMAIN]);

    let tx = await snowProjectsStore
      .connect(deployer)
      .createFor(projectOwner.address, [METADATA_CID, METADATA_DOMAIN]);

    await expect(tx)
      .to.emit(snowProjectsStore, 'Create')
      .withArgs(
        PROJECT_ID_2,
        projectOwner.address,
        [METADATA_CID, METADATA_DOMAIN],
        deployer.address,
      );
  });
});
