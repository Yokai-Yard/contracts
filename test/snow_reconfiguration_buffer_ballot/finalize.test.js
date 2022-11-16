import { expect } from 'chai';
import { ethers } from 'hardhat';
import { deployMockContract } from '@ethereum-waffle/mock-contract';
import snowFundingCycleStore from '../../artifacts/contracts/SNOWFundingCycleStore.sol/SNOWFundingCycleStore.json';

describe('SNOWReconfigurationBufferBallot::finalize(...)', function () {
  const DURATION = 3000;
  const PROJECT_ID = 69;

  async function setup() {
    const blockNum = await ethers.provider.getBlockNumber();
    const block = await ethers.provider.getBlock(blockNum);
    const timestamp = block.timestamp;

    let [deployer, caller, ...addrs] = await ethers.getSigners();

    let mockJbFundingCycleStore = await deployMockContract(deployer, snowFundingCycleStore.abi);

    let snowBallotFactory = await ethers.getContractFactory('SNOWReconfigurationBufferBallot');
    let snowBallot = await snowBallotFactory.deploy(DURATION, mockJbFundingCycleStore.address);

    return {
      deployer,
      caller,
      addrs,
      snowBallot,
      mockJbFundingCycleStore,
      timestamp,
    };
  }

  it('Should return Active if the delay has not yet passed and the funding cycle has not started yet', async function () {
    const { snowBallot, timestamp } = await setup();

    expect(
      await snowBallot.stateOf(
        PROJECT_ID,
        timestamp + 10, // configured
        timestamp + 10,
      ), // start (+10 as every Hardhat transaction move timestamp)
    ).to.equals(0);
  });

  it('Should return Failed if the delay has not yet passed and the funding cycle has already started', async function () {
    const { snowBallot, timestamp } = await setup();

    expect(await snowBallot.stateOf(PROJECT_ID, timestamp + 10, timestamp - 1)).to.equals(2);
  });

  it('Should return Approved if the delay has passed', async function () {
    const { snowBallot, timestamp } = await setup();

    expect(await snowBallot.stateOf(PROJECT_ID, timestamp - DURATION - 10, timestamp + 10)).to.equals(
      1,
    );
  });

  it('Should finalize an Active ballot as failed if the funding cycle has already started and emit event', async function () {
    const { caller, snowBallot, mockJbFundingCycleStore } = await setup();

    const blockNum = await ethers.provider.getBlockNumber();
    const block = await ethers.provider.getBlock(blockNum);
    const configuration = block.timestamp;

    await mockJbFundingCycleStore.mock.get.withArgs(PROJECT_ID, configuration).returns({
      number: 1,
      configuration: configuration,
      basedOn: configuration,
      start: configuration - 1,
      duration: 0,
      weight: 0,
      discountRate: 0,
      ballot: snowBallot.address,
      metadata: '0x69',
    });

    expect(await snowBallot.connect(caller).finalize(PROJECT_ID, configuration))
      .to.emit(snowBallot, 'Finalize')
      .withArgs(PROJECT_ID, configuration, 2, caller.address);

    expect(await snowBallot.stateOf(PROJECT_ID, configuration, configuration - 1)).to.equal(2);
  });

  it('Should not finalize an Active ballot', async function () {
    const { caller, timestamp, snowBallot, mockJbFundingCycleStore } = await setup();

    const blockNum = await ethers.provider.getBlockNumber();
    const block = await ethers.provider.getBlock(blockNum);
    const configuration = block.timestamp;

    await mockJbFundingCycleStore.mock.get.withArgs(PROJECT_ID, configuration).returns({
      number: 1,
      configuration: timestamp + 10,
      basedOn: configuration,
      start: timestamp + 10,
      duration: 0,
      weight: 0,
      discountRate: 0,
      ballot: snowBallot.address,
      metadata: '0x69',
    });

    // Try to finalize, while still Active
    expect(await snowBallot.connect(caller).finalize(PROJECT_ID, configuration)).to.not.emit(
      snowBallot,
      'Finalize',
    );
  });

  it('Should not finalize a ballot which is not active', async function () {
    const { caller, snowBallot, mockJbFundingCycleStore } = await setup();

    const blockNum = await ethers.provider.getBlockNumber();
    const block = await ethers.provider.getBlock(blockNum);
    const configuration = block.timestamp;

    await mockJbFundingCycleStore.mock.get.withArgs(PROJECT_ID, configuration).returns({
      number: 1,
      configuration: configuration,
      basedOn: configuration,
      start: configuration - 1,
      duration: 0,
      weight: 0,
      discountRate: 0,
      ballot: snowBallot.address,
      metadata: '0x69',
    });

    // Finalize as failed
    expect(await snowBallot.connect(caller).finalize(PROJECT_ID, configuration))
      .to.emit(snowBallot, 'Finalize')
      .withArgs(PROJECT_ID, configuration, 2, caller.address);

    expect(await snowBallot.stateOf(PROJECT_ID, configuration, configuration - 1)).to.equal(2);

    // Try to finalize it again
    expect(await snowBallot.connect(caller).finalize(PROJECT_ID, configuration)).to.not.emit(
      snowBallot,
      'Finalize',
    );

    expect(await snowBallot.stateOf(PROJECT_ID, configuration, configuration - 1)).to.equal(2);
  });
});
