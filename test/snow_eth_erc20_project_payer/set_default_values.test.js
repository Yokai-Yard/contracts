import { ethers } from 'hardhat';
import { expect } from 'chai';

import { deployMockContract } from '@ethereum-waffle/mock-contract';

import snowDirectory from '../../artifacts/contracts/SNOWDirectory.sol/SNOWDirectory.json';

describe('SNOWETHERC20ProjectPayer::setDefaultValues(...)', function () {
  const INITIAL_PROJECT_ID = 1;
  const INITIAL_BENEFICIARY = ethers.Wallet.createRandom().address;
  const INITIAL_PREFER_CLAIMED_TOKENS = false;
  const INITIAL_MEMO = 'hello world';
  const INITIAL_METADATA = ethers.utils.randomBytes(32);
  const INITIAL_PREFER_ADD_TO_BALANCE = false;
  const PROJECT_ID = 2;
  const BENEFICIARY = ethers.Wallet.createRandom().address;
  const PREFER_CLAIMED_TOKENS = true;
  const MEMO = 'hi world';
  const METADATA = ethers.utils.randomBytes(32);
  const PREFER_ADD_TO_BALANCE = true;

  async function setup() {
    let [deployer, owner, ...addrs] = await ethers.getSigners();

    let mockJbDirectory = await deployMockContract(deployer, snowDirectory.abi);

    let snowProjectPayerFactory = await ethers.getContractFactory('SNOWETHERC20ProjectPayer');
    let snowProjectPayer = await snowProjectPayerFactory.deploy(
      INITIAL_PROJECT_ID,
      INITIAL_BENEFICIARY,
      INITIAL_PREFER_CLAIMED_TOKENS,
      INITIAL_MEMO,
      INITIAL_METADATA,
      INITIAL_PREFER_ADD_TO_BALANCE,
      mockJbDirectory.address,
      owner.address,
    );

    return {
      deployer,
      owner,
      addrs,
      mockJbDirectory,
      snowProjectPayer,
    };
  }

  it(`Should set defaults if owner`, async function () {
    const { owner, snowProjectPayer } = await setup();

    expect(await snowProjectPayer.defaultProjectId()).to.equal(INITIAL_PROJECT_ID);
    expect(await snowProjectPayer.defaultBeneficiary()).to.equal(INITIAL_BENEFICIARY);
    expect(await snowProjectPayer.defaultPreferClaimedTokens()).to.equal(
      INITIAL_PREFER_CLAIMED_TOKENS,
    );
    expect(await snowProjectPayer.defaultMemo()).to.equal(INITIAL_MEMO);
    expect(await snowProjectPayer.defaultMetadata()).to.equal(
      ethers.BigNumber.from(INITIAL_METADATA),
    );
    expect(await snowProjectPayer.defaultPreferAddToBalance()).to.equal(
      INITIAL_PREFER_ADD_TO_BALANCE,
    );

    const setDefaultsTx = await snowProjectPayer
      .connect(owner)
      .setDefaultValues(
        PROJECT_ID,
        BENEFICIARY,
        PREFER_CLAIMED_TOKENS,
        MEMO,
        METADATA,
        PREFER_ADD_TO_BALANCE,
      );

    expect(await snowProjectPayer.defaultProjectId()).to.equal(PROJECT_ID);
    expect(await snowProjectPayer.defaultBeneficiary()).to.equal(BENEFICIARY);
    expect(await snowProjectPayer.defaultPreferClaimedTokens()).to.equal(PREFER_CLAIMED_TOKENS);
    expect(await snowProjectPayer.defaultMemo()).to.equal(MEMO);
    expect(await snowProjectPayer.defaultMetadata()).to.equal(ethers.BigNumber.from(METADATA));
    expect(await snowProjectPayer.defaultPreferAddToBalance()).to.equal(PREFER_ADD_TO_BALANCE);

    await expect(setDefaultsTx)
      .to.emit(snowProjectPayer, 'SetDefaultValues')
      .withArgs(
        PROJECT_ID,
        BENEFICIARY,
        PREFER_CLAIMED_TOKENS,
        MEMO,
        ethers.BigNumber.from(METADATA),
        PREFER_ADD_TO_BALANCE,
        owner.address,
      );
  });
  it(`Should set defaults if nothing has changed`, async function () {
    const { owner, snowProjectPayer } = await setup();

    expect(await snowProjectPayer.defaultProjectId()).to.equal(INITIAL_PROJECT_ID);
    expect(await snowProjectPayer.defaultBeneficiary()).to.equal(INITIAL_BENEFICIARY);
    expect(await snowProjectPayer.defaultPreferClaimedTokens()).to.equal(
      INITIAL_PREFER_CLAIMED_TOKENS,
    );
    expect(await snowProjectPayer.defaultMemo()).to.equal(INITIAL_MEMO);
    expect(await snowProjectPayer.defaultMetadata()).to.equal(
      ethers.BigNumber.from(INITIAL_METADATA),
    );
    expect(await snowProjectPayer.defaultPreferAddToBalance()).to.equal(
      INITIAL_PREFER_ADD_TO_BALANCE,
    );

    const setDefaultsTx = await snowProjectPayer
      .connect(owner)
      .setDefaultValues(
        INITIAL_PROJECT_ID,
        INITIAL_BENEFICIARY,
        INITIAL_PREFER_CLAIMED_TOKENS,
        INITIAL_MEMO,
        INITIAL_METADATA,
        INITIAL_PREFER_ADD_TO_BALANCE,
      );

    expect(await snowProjectPayer.defaultProjectId()).to.equal(INITIAL_PROJECT_ID);
    expect(await snowProjectPayer.defaultBeneficiary()).to.equal(INITIAL_BENEFICIARY);
    expect(await snowProjectPayer.defaultPreferClaimedTokens()).to.equal(
      INITIAL_PREFER_CLAIMED_TOKENS,
    );
    expect(await snowProjectPayer.defaultMemo()).to.equal(INITIAL_MEMO);
    expect(await snowProjectPayer.defaultMetadata()).to.equal(
      ethers.BigNumber.from(INITIAL_METADATA),
    );
    expect(await snowProjectPayer.defaultPreferAddToBalance()).to.equal(
      INITIAL_PREFER_ADD_TO_BALANCE,
    );

    await expect(setDefaultsTx)
      .to.emit(snowProjectPayer, 'SetDefaultValues')
      .withArgs(
        INITIAL_PROJECT_ID,
        INITIAL_BENEFICIARY,
        INITIAL_PREFER_CLAIMED_TOKENS,
        INITIAL_MEMO,
        ethers.BigNumber.from(INITIAL_METADATA),
        INITIAL_PREFER_ADD_TO_BALANCE,
        owner.address,
      );
  });

  it(`Can't set defaults if not owner`, async function () {
    const { addrs, snowProjectPayer } = await setup();

    await expect(
      snowProjectPayer
        .connect(addrs[0])
        .setDefaultValues(
          PROJECT_ID,
          BENEFICIARY,
          PREFER_CLAIMED_TOKENS,
          MEMO,
          METADATA,
          PREFER_ADD_TO_BALANCE,
        ),
    ).to.be.revertedWith('Ownable: caller is not the owner');
  });
});
