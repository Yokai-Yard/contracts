import { expect } from 'chai';
import { ethers } from 'hardhat';

import { makePackedPermissions } from '../helpers/utils';
import errors from '../helpers/errors.json';

describe('SNOWOperatorStore::setOperator(...)', function () {
  const DOMAIN = 1;
  const PERMISSION_INDEXES_EMPTY = [];
  const PERMISSION_INDEXES_1 = [1, 2, 3];
  const PERMISSION_INDEXES_2 = [4, 5, 6];
  const PERMISSION_INDEXES_OUT_OF_BOUND = [1, 2, 256];

  async function setup() {
    let [deployer, projectOwner, ...addrs] = await ethers.getSigners();

    let snowOperatorStoreFactory = await ethers.getContractFactory('SNOWOperatorStore');
    let snowOperatorStore = await snowOperatorStoreFactory.deploy();

    return {
      projectOwner,
      deployer,
      addrs,
      snowOperatorStore,
    };
  }

  async function setOperatorAndValidateEvent(
    snowOperatorStore,
    operator,
    account,
    domain,
    permissionIndexes,
    packedPermissionIndexes,
  ) {
    const tx = await snowOperatorStore
      .connect(account)
      .setOperator([
        /*operator=*/ operator.address,
        /*domain=*/ domain,
        /*permissionsIndexes=*/ permissionIndexes,
      ]);

    await expect(tx)
      .to.emit(snowOperatorStore, 'SetOperator')
      .withArgs(
        operator.address,
        account.address,
        domain,
        permissionIndexes,
        packedPermissionIndexes,
      );

    expect(await snowOperatorStore.permissionsOf(operator.address, account.address, domain)).to.equal(
      packedPermissionIndexes,
    );
  }

  it('Set operator with no previous value, override it, and clear it', async function () {
    const { deployer, projectOwner, snowOperatorStore } = await setup();

    await setOperatorAndValidateEvent(
      snowOperatorStore,
      projectOwner,
      /*account=*/ deployer,
      DOMAIN,
      PERMISSION_INDEXES_1,
      makePackedPermissions(PERMISSION_INDEXES_1),
    );

    await setOperatorAndValidateEvent(
      snowOperatorStore,
      projectOwner,
      /*account=*/ deployer,
      DOMAIN,
      PERMISSION_INDEXES_2,
      makePackedPermissions(PERMISSION_INDEXES_2),
    );

    await setOperatorAndValidateEvent(
      snowOperatorStore,
      projectOwner,
      /*account=*/ deployer,
      DOMAIN,
      PERMISSION_INDEXES_EMPTY,
      makePackedPermissions(PERMISSION_INDEXES_EMPTY),
    );
  });

  it('Index out of bounds', async function () {
    const { deployer, projectOwner, snowOperatorStore } = await setup();
    let permissionIndexes = [1, 2, 256];

    await expect(
      snowOperatorStore
        .connect(deployer)
        .setOperator([projectOwner.address, DOMAIN, PERMISSION_INDEXES_OUT_OF_BOUND]),
    ).to.be.revertedWith(errors.PERMISSION_INDEX_OUT_OF_BOUNDS);
  });
});
