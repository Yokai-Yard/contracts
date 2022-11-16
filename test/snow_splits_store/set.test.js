import { expect } from 'chai';
import { ethers } from 'hardhat';
import { daysFromNow, daysFromDate } from '../helpers/utils';
import { deployMockContract } from '@ethereum-waffle/mock-contract';
import snowOperatorStore from '../../artifacts/contracts/SNOWOperatorStore.sol/SNOWOperatorStore.json';
import snowProjects from '../../artifacts/contracts/SNOWProjects.sol/SNOWProjects.json';
import snowDirectory from '../../artifacts/contracts/SNOWDirectory.sol/SNOWDirectory.json';
import errors from '../helpers/errors.json';
import { BigNumber } from 'ethers';

describe('SNOWSplitsStore::set(...)', function () {
  const PROJECT_ID = 1;
  const DOMAIN = 2;
  const GROUP = 3;
  let SET_SPLITS_PERMISSION_INDEX;

  before(async function () {
    let snowOperationsFactory = await ethers.getContractFactory('SNOWOperations');
    let snowOperations = await snowOperationsFactory.deploy();
    SET_SPLITS_PERMISSION_INDEX = await snowOperations.SET_SPLITS();
  });

  async function setup() {
    let [deployer, projectOwner, ...addrs] = await ethers.getSigners();

    let mockJbOperatorStore = await deployMockContract(deployer, snowOperatorStore.abi);
    let mockJbProjects = await deployMockContract(deployer, snowProjects.abi);
    let mockJbDirectory = await deployMockContract(deployer, snowDirectory.abi);

    await mockJbProjects.mock.ownerOf.withArgs(PROJECT_ID).returns(projectOwner.address);

    await mockJbDirectory.mock.controllerOf.withArgs(PROJECT_ID).returns(projectOwner.address);

    let snowSplitsStoreFact = await ethers.getContractFactory('contracts/SNOWSplitsStore.sol:SNOWSplitsStore');
    let snowSplitsStore = await snowSplitsStoreFact.deploy(
      mockJbOperatorStore.address,
      mockJbProjects.address,
      mockJbDirectory.address,
    );

    let splits = makeSplits(addrs[0].address);
    let groupedSplits = [{ group: GROUP, splits }];

    return {
      deployer,
      projectOwner,
      addrs,
      snowSplitsStore,
      splits,
      groupedSplits,
      mockJbOperatorStore,
      mockJbProjects,
      mockJbDirectory,
    };
  }

  function makeSplits(beneficiaryAddress, count = 4) {
    let splits = [];
    for (let i = 0; i < count; i++) {
      splits.push({
        preferClaimed: false,
        preferAddToBalance: false,
        percent: BigNumber.from(Math.floor(1000000000 / count)),
        projectId: BigNumber.from(4),
        beneficiary: beneficiaryAddress,
        lockedUntil: BigNumber.from(0),
        allocator: ethers.constants.AddressZero,
      });
    }
    return splits;
  }

  function cleanSplits(splits) {
    let cleanedSplits = [];
    for (let split of splits) {
      cleanedSplits.push({
        preferClaimed: split[0],
        preferAddToBalance: split[1],
        percent: BigNumber.from(split[2]),
        projectId: BigNumber.from(split[3].toNumber()),
        beneficiary: split[4],
        lockedUntil: BigNumber.from(split[5]),
        allocator: split[6],
      });
    }
    return cleanedSplits;
  }

  it('Should set splits with beneficiaries and emit events if project owner', async function () {
    const { projectOwner, addrs, snowSplitsStore, splits, groupedSplits, mockJbOperatorStore, mockJbDirectory } =
      await setup();

    await mockJbOperatorStore.mock.hasPermission.returns(false);
    await mockJbDirectory.mock.controllerOf.returns(addrs[0].address);

    const tx = await snowSplitsStore.connect(projectOwner).set(PROJECT_ID, DOMAIN, groupedSplits);

    // Expect one event per split
    await Promise.all(
      splits.map(async (split, _) => {
        await expect(tx)
          .to.emit(snowSplitsStore, 'SetSplit')
          .withArgs(PROJECT_ID, DOMAIN, GROUP, Object.values(split), projectOwner.address);
      }),
    );

    let splitsStored = cleanSplits(await snowSplitsStore.splitsOf(PROJECT_ID, DOMAIN, GROUP));
    expect(splitsStored).to.eql(splits);
  });

  it('Should set splits with allocators set', async function () {
    const { projectOwner, addrs, snowSplitsStore, splits, mockJbOperatorStore, mockJbDirectory } =
      await setup();

    await mockJbOperatorStore.mock.hasPermission.returns(false);
    await mockJbDirectory.mock.controllerOf.returns(addrs[0].address);

    const newSplits = splits.map((elt) => ({
      ...elt,
      preferClaimed: true,
      preferAddToBalance: true,
      beneficiary: ethers.constants.AddressZero,
      allocator: addrs[5].address,
    }));

    const newGroupedSplits = [{ group: GROUP, splits: newSplits }];

    await snowSplitsStore.connect(projectOwner).set(PROJECT_ID, DOMAIN, newGroupedSplits);

    let splitsStored = cleanSplits(await snowSplitsStore.splitsOf(PROJECT_ID, DOMAIN, GROUP));
    expect(splitsStored).to.eql(newSplits);
  });

  it('Should set splits with allocators and beneficiaries set', async function () {
    const { projectOwner, addrs, snowSplitsStore, splits, mockJbOperatorStore, mockJbDirectory } =
      await setup();

    await mockJbOperatorStore.mock.hasPermission.returns(false);
    await mockJbDirectory.mock.controllerOf.returns(addrs[0].address);

    const newSplits = splits.map((elt) => ({
      ...elt,
      beneficiary: addrs[5].address,
      allocator: addrs[5].address,
    }));

    const newGroupedSplits = [{ group: GROUP, splits: newSplits }];

    await snowSplitsStore.connect(projectOwner).set(PROJECT_ID, DOMAIN, newGroupedSplits);

    let splitsStored = cleanSplits(await snowSplitsStore.splitsOf(PROJECT_ID, DOMAIN, GROUP));
    expect(splitsStored).to.eql(newSplits);
  });

  it('Should set new splits when overwriting existing splits with the same ID/Domain/Group', async function () {
    const { projectOwner, addrs, snowSplitsStore, groupedSplits } = await setup();

    await snowSplitsStore.connect(projectOwner).set(PROJECT_ID, DOMAIN, groupedSplits);

    let newBeneficiary = addrs[5].address;
    let newSplits = makeSplits(newBeneficiary);
    let newGroupedSplits = [{ group: GROUP, splits: newSplits }];

    await snowSplitsStore.connect(projectOwner).set(PROJECT_ID, DOMAIN, newGroupedSplits);

    let splitsStored = cleanSplits(await snowSplitsStore.splitsOf(PROJECT_ID, DOMAIN, GROUP));
    expect(splitsStored).to.eql(newSplits);
  });
  it('Should set splits overriding ones with a set allocator or lockedUntil timestamp', async function () {
    const { projectOwner, addrs, snowSplitsStore, splits, mockJbOperatorStore, mockJbDirectory } =
      await setup();

    await mockJbOperatorStore.mock.hasPermission.returns(false);
    await mockJbDirectory.mock.controllerOf.returns(addrs[0].address);

    // Set one locked split
    splits[1].allocator = addrs[4].address;
    let groupedSplits = [{ group: GROUP, splits: splits }];

    await snowSplitsStore.connect(projectOwner).set(PROJECT_ID, DOMAIN, groupedSplits);

    // Set one locked split
    splits[1].allocator = ethers.constants.AddressZero;
    groupedSplits = [{ group: GROUP, splits }];

    await snowSplitsStore.connect(projectOwner).set(PROJECT_ID, DOMAIN, groupedSplits);

    let splitsStored = cleanSplits(await snowSplitsStore.splitsOf(PROJECT_ID, DOMAIN, GROUP));
    expect(splitsStored).to.eql(splits);
  });

  it("Can't set new splits without including a preexisting locked one", async function () {
    const { projectOwner, addrs, snowSplitsStore, splits, groupedSplits } = await setup();

    // Set one locked split
    splits[1].lockedUntil = await daysFromNow(1);
    await snowSplitsStore.connect(projectOwner).set(PROJECT_ID, DOMAIN, groupedSplits);

    // New splits without the previous locked one
    let newBeneficiary = addrs[5].address;
    let newSplits = makeSplits(newBeneficiary);

    const newGroupedSplits = [{ group: GROUP, splits: newSplits }];

    await expect(
      snowSplitsStore.connect(projectOwner).set(PROJECT_ID, DOMAIN, newGroupedSplits),
    ).to.be.revertedWith(errors.PREVIOUS_LOCKED_SPLITS_NOT_INCLUDED);
  });

  it('Should set new splits with extension of a preexisting locked one', async function () {
    const { projectOwner, addrs, snowSplitsStore, splits, groupedSplits } = await setup();

    let lockDate = await daysFromNow(1);

    // Set one locked split
    splits[1].lockedUntil = lockDate;
    await snowSplitsStore.connect(projectOwner).set(PROJECT_ID, DOMAIN, groupedSplits);

    // Try to set new ones, with lock extension of one day
    let newLockDate = daysFromDate(lockDate, 1);
    let newSplits = makeSplits(addrs[5].address);

    newSplits[1].lockedUntil = newLockDate;
    newSplits[1].beneficiary = addrs[0].address;

    const newGroupedSplits = [{ group: GROUP, splits: newSplits }];

    await snowSplitsStore.connect(projectOwner).set(PROJECT_ID, DOMAIN, newGroupedSplits);

    let splitsStored = await snowSplitsStore.splitsOf(PROJECT_ID, DOMAIN, GROUP);
    expect(splitsStored[1].lockedUntil).to.equal(newLockDate);
  });

  it("Can't set splits when a split has a percent of 0", async function () {
    const { projectOwner, snowSplitsStore, splits, groupedSplits } = await setup();

    // Set one 0% split
    splits[1].percent = 0;

    await expect(
      snowSplitsStore.connect(projectOwner).set(PROJECT_ID, DOMAIN, groupedSplits),
    ).to.be.revertedWith(errors.INVALID_SPLIT_PERCENT);
  });

  it("Can't set splits if the sum of the percents is greather than 1000000000", async function () {
    const { projectOwner, snowSplitsStore, splits, groupedSplits } = await setup();

    // Set sum at 1000000001
    splits[0].percent += 1;

    await expect(
      snowSplitsStore.connect(projectOwner).set(PROJECT_ID, DOMAIN, groupedSplits),
    ).to.be.revertedWith(errors.INVALID_TOTAL_PERCENT);
  });

  it("Can't set splits if the projectId is greater than 2^56", async function () {
    const { projectOwner, snowSplitsStore, splits, groupedSplits } = await setup();

    splits[0].projectId = ethers.BigNumber.from(2).pow(56);

    await expect(
      snowSplitsStore.connect(projectOwner).set(PROJECT_ID, DOMAIN, groupedSplits),
    ).to.be.revertedWith(errors.INVALID_PROJECT_ID);
  });

  it("Can't set splits if the lockedUntil is greater than 2^48", async function () {
    const { projectOwner, snowSplitsStore, splits, groupedSplits } = await setup();

    splits[0].lockedUntil = ethers.BigNumber.from(2).pow(48);

    await expect(
      snowSplitsStore.connect(projectOwner).set(PROJECT_ID, DOMAIN, groupedSplits),
    ).to.be.revertedWith(errors.INVALID_LOCKED_UNTIL);
  });

  it('Should set splits if controller', async function () {
    const { addrs, snowSplitsStore, groupedSplits, mockJbDirectory } = await setup();

    let caller = addrs[0];

    await mockJbDirectory.mock.controllerOf.withArgs(PROJECT_ID).returns(caller.address);

    await expect(snowSplitsStore.connect(caller).set(PROJECT_ID, DOMAIN, groupedSplits)).to.be.not
      .reverted;
  });

  it('Should set splits if not the project owner but has permission', async function () {
    const { projectOwner, addrs, snowSplitsStore, groupedSplits, mockJbOperatorStore } = await setup();

    let caller = addrs[0];

    await mockJbOperatorStore.mock.hasPermission
      .withArgs(caller.address, projectOwner.address, PROJECT_ID, SET_SPLITS_PERMISSION_INDEX)
      .returns(true);

    await expect(snowSplitsStore.connect(caller).set(PROJECT_ID, DOMAIN, groupedSplits)).to.be.not
      .reverted;
  });

  it("Can't set splits if not project owner and doesn't have permission", async function () {
    const { projectOwner, addrs, snowSplitsStore, groupedSplits, mockJbOperatorStore } = await setup();

    let caller = addrs[1];

    await mockJbOperatorStore.mock.hasPermission
      .withArgs(caller.address, projectOwner.address, PROJECT_ID, SET_SPLITS_PERMISSION_INDEX)
      .returns(false);

    await mockJbOperatorStore.mock.hasPermission
      .withArgs(caller.address, projectOwner.address, 0, SET_SPLITS_PERMISSION_INDEX)
      .returns(false);

    await expect(
      snowSplitsStore.connect(caller).set(PROJECT_ID, DOMAIN, groupedSplits),
    ).to.be.revertedWith(errors.UNAUTHORIZED);
  });
});
