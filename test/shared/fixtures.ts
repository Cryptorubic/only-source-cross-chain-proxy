import { RubicProxy, TestDEX, TestERC20, TestCrossChain } from '../../typechain';
import { ethers } from 'hardhat';
import { RUBIC_PLATFORM_FEE, MIN_TOKEN_AMOUNT, MAX_TOKEN_AMOUNT, FIXED_CRYPTO_FEE } from './consts';
import {
    abi as WHITELIST_ABI,
    bytecode as WHITELIST_BYTECODE
} from 'rubic-whitelist-contract/artifacts/contracts/test/WhitelistMock.sol/WhitelistMock.json';
import { Contract } from 'ethers';

type Bridge = RubicProxy;

interface BridgeFixture {
    bridge: Bridge;
    whitelist: Contract;
    transitToken: TestERC20;
    swapToken: TestERC20;
    DEX: TestDEX;
    routerCrossChain: TestCrossChain;
}

const bridgeFixture = async function (): Promise<{
    transitToken: TestERC20;
    swapToken: TestERC20;
    DEX: TestDEX;
    routerCrossChain: TestCrossChain;
}> {
    const tokenFactory = await ethers.getContractFactory('TestERC20');
    const transitToken = (await tokenFactory.deploy()) as TestERC20;
    const swapToken = (await tokenFactory.deploy()) as TestERC20;

    const DEXFactory = await ethers.getContractFactory('TestDEX');
    const DEX = (await DEXFactory.deploy()) as TestDEX;

    const routerFactory = await ethers.getContractFactory('TestCrossChain');
    const routerCrossChain = (await routerFactory.deploy()) as TestCrossChain;

    await transitToken.transfer(DEX.address, ethers.utils.parseEther('100'));
    return { transitToken, swapToken, DEX, routerCrossChain };
};

export const onlySourceFixture = async function (): Promise<BridgeFixture> {
    const { transitToken, swapToken, DEX, routerCrossChain } = await bridgeFixture();
    const bridgeFactory = await ethers.getContractFactory('RubicProxy');

    const deployer = await bridgeFactory.signer.getAddress();

    const whitelistFactory = await ethers.getContractFactory(WHITELIST_ABI, WHITELIST_BYTECODE);
    const whitelist = await whitelistFactory.deploy([], deployer);

    await whitelist.addCrossChains([DEX.address, routerCrossChain.address]);

    const bridge = (await bridgeFactory.deploy(
        FIXED_CRYPTO_FEE,
        RUBIC_PLATFORM_FEE,
        [transitToken.address, swapToken.address],
        [MIN_TOKEN_AMOUNT, MIN_TOKEN_AMOUNT],
        [MAX_TOKEN_AMOUNT, MAX_TOKEN_AMOUNT],
        deployer,
        whitelist.address
    )) as Bridge;

    await transitToken.approve(bridge.address, ethers.utils.parseEther('100000'));
    await swapToken.approve(bridge.address, ethers.utils.parseEther('100000'));

    return { bridge, whitelist, transitToken, swapToken, DEX, routerCrossChain };
};
