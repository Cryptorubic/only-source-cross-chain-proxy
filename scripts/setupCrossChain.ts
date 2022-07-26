import { ethers } from 'hardhat';

import { RubicProxy } from '../typechain';

async function main() {
    const proxyFactory = await ethers.getContractFactory('RubicProxy');

    let proxy = (await proxyFactory.attach(
        '0x3332241a5a4eCb4c28239A9731ad45De7f000333'
    )) as RubicProxy;

    await proxy.setRubicPlatformFee(0);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
