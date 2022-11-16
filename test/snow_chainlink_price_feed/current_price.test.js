import { expect } from 'chai';
import { ethers } from 'hardhat';
import { compilerOutput } from '@chainlink/contracts/abi/v0.6/AggregatorV3Interface.json';
import { deployMockContract } from '@ethereum-waffle/mock-contract';
import { BigNumber } from '@ethersproject/bignumber';

describe('SNOWChainlinkV3PriceFeed::currentPrice(...)', function () {
  let deployer;
  let addrs;

  let aggregatorV3Contract;

  let snowChainlinkPriceFeedFactory;
  let snowChainlinkPriceFeed;
  let targetDecimals = 18;

  beforeEach(async function () {
    [deployer, ...addrs] = await ethers.getSigners();

    aggregatorV3Contract = await deployMockContract(deployer, compilerOutput.abi);

    snowChainlinkPriceFeedFactory = await ethers.getContractFactory('SNOWChainlinkV3PriceFeed');
    snowChainlinkPriceFeed = await snowChainlinkPriceFeedFactory.deploy(aggregatorV3Contract.address);
  });

  /**
   * Initialiazes mock price feed, adds it to SNOWPrices, and returns the fetched result.
   */
  async function currentPrice(price, decimals) {
    await aggregatorV3Contract.mock.latestRoundData.returns(0, price, 0, 0, 0);
    await aggregatorV3Contract.mock.decimals.returns(decimals);
    return await snowChainlinkPriceFeed.connect(deployer).currentPrice(targetDecimals);
  }

  it('Get price no decimals', async function () {
    let price = 400;
    expect(await currentPrice(price, /*decimals=*/ 0)).to.equal(
      ethers.BigNumber.from(price).mul(BigNumber.from(10).pow(targetDecimals)),
    );
  });

  it('Check price less than target decimal', async function () {
    let price = 400;
    let decimals = targetDecimals - 1;
    expect(await currentPrice(price, decimals)).to.equal(
      ethers.BigNumber.from(price).mul(BigNumber.from(10).pow(targetDecimals - decimals)),
    );
  });

  it('Check price target decimals', async function () {
    let price = 400;
    expect(await currentPrice(price, targetDecimals)).to.equal(ethers.BigNumber.from(price));
  });

  it('Check price more than target decimals', async function () {
    let price = 400;
    let decimals = targetDecimals + 1;
    expect(await currentPrice(price, decimals)).to.equal(
      ethers.BigNumber.from(price).div(ethers.BigNumber.from(10).pow(decimals - targetDecimals)),
    );
  });
});
