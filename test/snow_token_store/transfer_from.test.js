import { expect } from 'chai';
import { ethers } from 'hardhat';

import { deployMockContract } from '@ethereum-waffle/mock-contract';

import snowDirectory from '../../artifacts/contracts/SNOWDirectory.sol/SNOWDirectory.json';
import snowOperatoreStore from '../../artifacts/contracts/SNOWOperatorStore.sol/SNOWOperatorStore.json';
import snowProjects from '../../artifacts/contracts/SNOWProjects.sol/SNOWProjects.json';
import errors from '../helpers/errors.json';

describe('SNOWTokenStore::transferFrom(...)', function () {
  const PROJECT_ID = 2;
  const TOKEN_NAME = 'TestTokenDAO';
  const TOKEN_SYMBOL = 'TEST';

  async function setup() {
    const [deployer, controller, holder, recipient] = await ethers.getSigners();

    const snowOperationsFactory = await ethers.getContractFactory('SNOWOperations');
    const snowOperations = await snowOperationsFactory.deploy();

    const TRANSFER_INDEX = await snowOperations.TRANSFER();

    const mockJbOperatorStore = await deployMockContract(deployer, snowOperatoreStore.abi);
    const mockJbProjects = await deployMockContract(deployer, snowProjects.abi);
    const mockJbDirectory = await deployMockContract(deployer, snowDirectory.abi);

    const snowTokenStoreFactory = await ethers.getContractFactory('SNOWTokenStore');
    const snowTokenStore = await snowTokenStoreFactory.deploy(
      mockJbOperatorStore.address,
      mockJbProjects.address,
      mockJbDirectory.address,
    );

    return {
      controller,
      holder,
      recipient,
      mockJbDirectory,
      mockJbOperatorStore,
      snowTokenStore,
      TRANSFER_INDEX,
    };
  }

  it('Should transfer unclaimed tokens and emit event if caller has permission', async function () {
    const {
      controller,
      holder,
      recipient,
      mockJbDirectory,
      mockJbOperatorStore,
      snowTokenStore,
      TRANSFER_INDEX,
    } = await setup();

    await mockJbDirectory.mock.controllerOf.withArgs(PROJECT_ID).returns(controller.address);
    await mockJbOperatorStore.mock.hasPermission
      .withArgs(controller.address, holder.address, PROJECT_ID, TRANSFER_INDEX)
      .returns(true);

    // Issue tokens for project
    await snowTokenStore.connect(controller).issueFor(PROJECT_ID, TOKEN_NAME, TOKEN_SYMBOL);

    // Mint unclaimed tokens
    const numTokens = 20;
    await snowTokenStore.connect(controller).mintFor(holder.address, PROJECT_ID, numTokens, false);

    // Transfer unclaimed tokens to new recipient
    const transferFromTx = await snowTokenStore
      .connect(controller)
      .transferFrom(
        /* sender */ holder.address,
        PROJECT_ID,
        /* recipient */ recipient.address,
        numTokens,
      );

    expect(await snowTokenStore.unclaimedBalanceOf(holder.address, PROJECT_ID)).to.equal(0);
    expect(await snowTokenStore.unclaimedBalanceOf(recipient.address, PROJECT_ID)).to.equal(
      numTokens,
    );

    await expect(transferFromTx)
      .to.emit(snowTokenStore, 'Transfer')
      .withArgs(holder.address, PROJECT_ID, recipient.address, numTokens, controller.address);
  });

  it(`Can't transfer unclaimed tokens to zero address`, async function () {
    const { controller, holder, mockJbOperatorStore, snowTokenStore, TRANSFER_INDEX } = await setup();

    await mockJbOperatorStore.mock.hasPermission
      .withArgs(controller.address, holder.address, PROJECT_ID, TRANSFER_INDEX)
      .returns(true);

    await expect(
      snowTokenStore
        .connect(controller)
        .transferFrom(
          holder.address,
          PROJECT_ID,
          /* recipient */ ethers.constants.AddressZero,
          /* amount= */ 1,
        ),
    ).to.be.revertedWith(errors.RECIPIENT_ZERO_ADDRESS);
  });

  it(`Can't transfer more unclaimed tokens than available balance`, async function () {
    const { controller, holder, recipient, mockJbOperatorStore, snowTokenStore, TRANSFER_INDEX } =
      await setup();

    await mockJbOperatorStore.mock.hasPermission
      .withArgs(controller.address, holder.address, PROJECT_ID, TRANSFER_INDEX)
      .returns(true);

    // 0 unclaimed tokens available, try to transfer 1
    await expect(
      snowTokenStore
        .connect(controller)
        .transferFrom(
          /* sender */ holder.address,
          PROJECT_ID,
          /* recipient */ recipient.address,
          /* amount= */ 1,
        ),
    ).to.be.revertedWith(errors.INSUFFICIENT_UNCLAIMED_TOKENS);
  });

  it(`Can't transfer unclaimed tokens if caller lacks permission`, async function () {
    const { controller, holder, recipient, mockJbOperatorStore, snowTokenStore, TRANSFER_INDEX } =
      await setup();

    await mockJbOperatorStore.mock.hasPermission
      .withArgs(controller.address, holder.address, PROJECT_ID, TRANSFER_INDEX)
      .returns(false);

    await expect(
      snowTokenStore
        .connect(controller)
        .transferFrom(
          /* sender */ holder.address,
          PROJECT_ID,
          /* recipient */ recipient.address,
          /* amount= */ 1,
        ),
    ).to.be.reverted;
  });
});
