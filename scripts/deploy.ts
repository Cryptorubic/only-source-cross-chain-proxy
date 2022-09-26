const hre = require('hardhat');
import { ethers, network } from 'hardhat';
import Config from '../config/config.json';

import * as dotenv from 'dotenv';
dotenv.config();

async function main() {
    const RubicProxyFactory = await ethers.getContractFactory('RubicProxy');
    const chain = Config.chains.find(_chain => _chain.id === network.config.chainId)!;

    const RubicProxy = await RubicProxyFactory.deploy(0, 0, chain?.routers, [], [], []);

    await RubicProxy.deployed();

    console.log('RubicProxy deployed to ', RubicProxy.address);

    await new Promise(r => setTimeout(r, 10000));

    let managerRole = await RubicProxy.MANAGER_ROLE();

    await RubicProxy.grantRole(managerRole, '0xaE6FAf6C1c0006b81ce04308E225B01D9b667A6E');
    console.log('Manager role granted.');

    await new Promise(r => setTimeout(r, 10000));

    await RubicProxy.transferAdmin('0x105A3BA3637A29D36F61c7F03f55Da44B4591Cd1');
    console.log('Admin role granted.');

    await new Promise(r => setTimeout(r, 10000));

    await hre.run('verify:verify', {
        address: RubicProxy.address,
        constructorArguments: [0, 0, chain.routers, [], [], []]
    });
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});
