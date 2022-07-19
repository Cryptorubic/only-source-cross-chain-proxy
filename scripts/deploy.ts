const hre = require('hardhat');
import { ethers } from 'hardhat';

async function main() {
    const LiFiProxyFactory = await ethers.getContractFactory('RubicProxy');

    const LiFiProxy = await LiFiProxyFactory.deploy(
        0,
        [],
        [],
        [],
        [],
        1500,
        '0x663DC15D3C1aC63ff12E45Ab68FeA3F0a883C251'
    );

    await LiFiProxy.deployed();

    console.log('LiFiProxy deployed to ', LiFiProxy.address);

    await new Promise(r => setTimeout(r, 10000));

    await hre.run('verify:verify', {
        address: LiFiProxy.address,
        constructorArguments: [
            0,
            [],
            [],
            [],
            [],
            1500,
            '0x663DC15D3C1aC63ff12E45Ab68FeA3F0a883C251'
        ]
    });
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
