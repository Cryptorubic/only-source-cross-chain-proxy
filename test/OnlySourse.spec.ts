import { ethers, waffle } from 'hardhat';
import { Wallet } from '@ethersproject/wallet';
import { RubicProxy, TestERC20, TestDEX, TestCrossChain } from '../typechain';
import { expect } from 'chai';
import { BigNumber as BN, ContractTransaction, BytesLike } from 'ethers';
import * as consts from './shared/consts';
import { onlySourceFixture } from './shared/fixtures';
import { calcCryptoFees, calcTokenFees } from './shared/utils';
import { balance } from '@openzeppelin/test-helpers';

const createFixtureLoader = waffle.createFixtureLoader;

describe('TestOnlySource', () => {
    let owner: Wallet, swapper: Wallet, integratorWallet: Wallet, manager: Wallet;
    let bridge: RubicProxy;
    let transitToken: TestERC20;
    let swapToken: TestERC20;
    let DEX: TestDEX;
    let routerCrossChain: TestCrossChain;

    let loadFixture: ReturnType<typeof createFixtureLoader>;

    async function callBridge(
        data: BytesLike,
        {
            srcInputToken = swapToken.address,
            dstOutputToken = transitToken.address,
            integrator = ethers.constants.AddressZero,
            recipient = owner.address,
            srcInputAmount = consts.DEFAULT_AMOUNT_IN,
            dstMinOutputAmount = consts.MIN_TOKEN_AMOUNT,
            dstChainID = 228,
            router = routerCrossChain.address,
            gateway = routerCrossChain.address
        } = {},
        value?: BN
    ): Promise<ContractTransaction> {
        if (value === undefined) {
            // call with tokens
            value = (
                await calcCryptoFees({
                    bridge,
                    integrator: integrator === ethers.constants.AddressZero ? undefined : integrator
                })
            ).totalCryptoFee;

            return bridge.routerCall(
                {
                    srcInputToken,
                    srcInputAmount,
                    dstChainID,
                    dstOutputToken,
                    dstMinOutputAmount,
                    recipient,
                    integrator,
                    router
                },
                gateway,
                data,
                { value: value }
            );
        }

        return bridge.routerCallNative(
            {
                srcInputToken,
                dstOutputToken,
                integrator,
                recipient,
                srcInputAmount,
                dstMinOutputAmount,
                dstChainID,
                router
            },
            data,
            { value: value }
        );
    }

    before('initialize', async () => {
        [owner, swapper, integratorWallet, manager] = await (ethers as any).getSigners();
        loadFixture = createFixtureLoader();
    });

    beforeEach('deploy proxy', async () => {
        ({ bridge, transitToken, swapToken, DEX, routerCrossChain } = await loadFixture(
            onlySourceFixture
        ));
    });

    describe('right settings', () => {
        it('routers', async () => {
            const routers = await bridge.getAvailableRouters();
            expect(routers).to.deep.eq([DEX.address, routerCrossChain.address]);
        });
        it('min max amounts', async () => {
            expect(await bridge.minTokenAmount(transitToken.address)).to.be.eq(
                consts.MIN_TOKEN_AMOUNT
            );
            expect(await bridge.minTokenAmount(swapToken.address)).to.be.eq(
                consts.MIN_TOKEN_AMOUNT
            );

            expect(await bridge.maxTokenAmount(transitToken.address)).to.be.eq(
                consts.MAX_TOKEN_AMOUNT
            );
            expect(await bridge.maxTokenAmount(swapToken.address)).to.be.eq(
                consts.MAX_TOKEN_AMOUNT
            );
        });
        it('fixed crypto fee', async () => {
            expect(await bridge.fixedCryptoFee()).to.be.eq(consts.FIXED_CRYPTO_FEE);
        });
    });

    describe('check setters', async () => {
        beforeEach('grant roles', async () => {
            await bridge.grantRole(await bridge.MANAGER_ROLE(), manager.address);
        });

        it('only manager can set integrator fee info', async () => {
            const feeInfo = {
                isIntegrator: true,
                tokenFee: 0,
                RubicFixedCryptoShare: 0,
                RubicTokenShare: 0,
                fixedFeeAmount: BN.from(0)
            };

            await expect(
                bridge.connect(swapper).setIntegratorInfo(integratorWallet.address, feeInfo)
            ).to.be.revertedWith('NotAManager()');

            await bridge.setIntegratorInfo(integratorWallet.address, feeInfo);
            const {
                isIntegrator,
                tokenFee,
                RubicFixedCryptoShare,
                RubicTokenShare,
                fixedFeeAmount
            }: {
                isIntegrator: boolean;
                tokenFee: number;
                RubicFixedCryptoShare: number;
                RubicTokenShare: number;
                fixedFeeAmount: BN;
            } = await bridge.integratorToFeeInfo(integratorWallet.address);
            expect({
                isIntegrator,
                tokenFee,
                RubicFixedCryptoShare,
                RubicTokenShare,
                fixedFeeAmount
            }).to.deep.eq(feeInfo);
        });
        it('only manager can set min token amounts', async () => {
            await expect(
                bridge
                    .connect(swapper)
                    .setMinTokenAmount(swapToken.address, consts.MIN_TOKEN_AMOUNT.add('1'))
            ).to.be.revertedWith('NotAManager');

            await bridge.setMinTokenAmount(swapToken.address, consts.MIN_TOKEN_AMOUNT.add('1'));
            expect(await bridge.minTokenAmount(swapToken.address)).to.be.eq(
                consts.MIN_TOKEN_AMOUNT.add('1')
            );
        });
        it('only manager can set max token amounts', async () => {
            await expect(
                bridge
                    .connect(swapper)
                    .setMaxTokenAmount(swapToken.address, consts.MAX_TOKEN_AMOUNT.add('1'))
            ).to.be.revertedWith('NotAManager');

            await bridge.setMaxTokenAmount(swapToken.address, consts.MAX_TOKEN_AMOUNT.add('1'));
            expect(await bridge.maxTokenAmount(swapToken.address)).to.be.eq(
                consts.MAX_TOKEN_AMOUNT.add('1')
            );
        });
        it('cannot set min token amount greater than max', async () => {
            const currentMax = await bridge.maxTokenAmount(swapToken.address);
            await expect(
                bridge.setMinTokenAmount(swapToken.address, currentMax.add('1'))
            ).to.be.revertedWith('MinMustBeLowerThanMax()');
        });
        it('cannot set max token amount less than min', async () => {
            const currentMin = await bridge.minTokenAmount(swapToken.address);
            await expect(
                bridge.setMaxTokenAmount(swapToken.address, currentMin.sub('1'))
            ).to.be.revertedWith('MaxMustBeBiggerThanMin()');
        });
        it('only manager can set fixed crypto fee', async () => {
            await expect(bridge.connect(swapper).setFixedCryptoFee('100')).to.be.revertedWith(
                'NotAManager()'
            );

            await bridge.setFixedCryptoFee('100');
            expect(await bridge.fixedCryptoFee()).to.be.eq('100');
        });
        it('only manager can remove routers', async () => {
            await expect(
                bridge.connect(swapper).removeAvailableRouter(DEX.address)
            ).to.be.revertedWith('NotAManager()');

            await bridge.removeAvailableRouter(DEX.address);
            await bridge.removeAvailableRouter(routerCrossChain.address);
            expect(await bridge.getAvailableRouters()).to.be.deep.eq([]);
        });
        it('only manager can add routers', async () => {
            await expect(
                bridge.connect(swapper).addAvailableRouter(owner.address)
            ).to.be.revertedWith('NotAManager()');

            await bridge.addAvailableRouter(owner.address);

            await expect(await bridge.getAvailableRouters()).to.be.deep.eq([
                DEX.address,
                routerCrossChain.address,
                owner.address
            ]);
        });

        it('Should sweep tokens', async () => {
            await expect(
                bridge
                    .connect(swapper)
                    .sweepTokens(swapToken.address, ethers.utils.parseEther('10'))
            ).to.be.revertedWith('NotAnAdmin()');

            await swapToken.mint(bridge.address, ethers.utils.parseEther('10'));
            await bridge.sweepTokens(swapToken.address, ethers.utils.parseEther('10'));

            expect(Number(await swapToken.balanceOf(bridge.address))).to.be.deep.eq(0);
        });

        it('validation of integratorFeeInfo', async () => {
            let feeInfo = {
                isIntegrator: true,
                tokenFee: consts.DENOMINATOR.add('1'),
                RubicFixedCryptoShare: BN.from(0),
                RubicTokenShare: BN.from(0),
                fixedFeeAmount: BN.from(0)
            };

            await expect(
                bridge.setIntegratorInfo(integratorWallet.address, feeInfo)
            ).to.be.revertedWith('FeeTooHigh()');

            feeInfo = {
                isIntegrator: true,
                tokenFee: consts.DENOMINATOR,
                RubicFixedCryptoShare: consts.DENOMINATOR.add('1'),
                RubicTokenShare: consts.DENOMINATOR,
                fixedFeeAmount: BN.from(0)
            };

            await expect(
                bridge.setIntegratorInfo(integratorWallet.address, feeInfo)
            ).to.be.revertedWith('ShareTooHigh()');

            feeInfo = {
                isIntegrator: true,
                tokenFee: consts.DENOMINATOR,
                RubicFixedCryptoShare: consts.DENOMINATOR,
                RubicTokenShare: consts.DENOMINATOR.add('1'),
                fixedFeeAmount: BN.from(0)
            };

            await expect(
                bridge.setIntegratorInfo(integratorWallet.address, feeInfo)
            ).to.be.revertedWith('ShareTooHigh()');
        });
    });

    describe('cross chain tests', () => {
        beforeEach('setup before swaps', async () => {
            bridge = bridge.connect(swapper);

            await swapToken.transfer(swapper.address, ethers.utils.parseEther('10'));
            await swapToken.connect(swapper).approve(bridge.address, ethers.constants.MaxUint256);
        });
        it('cross chain with swap fails if router not available', async () => {
            await expect(callBridge('0x', { router: owner.address })).to.be.revertedWith(
                `RouterNotAvailable()`
            );
        });
        it('cross chain with swap amounts without integrator', async () => {
            const { feeAmount, amountWithoutFee, RubicFee } = await calcTokenFees({
                bridge,
                amountWithFee: consts.DEFAULT_AMOUNT_IN
            });
            await callBridge(
                await routerCrossChain.viewEncode(swapToken.address, amountWithoutFee, 228)
            );
            expect(await swapToken.allowance(bridge.address, routerCrossChain.address)).to.be.eq(0);

            expect(await swapToken.balanceOf(bridge.address)).to.be.eq(
                feeAmount,
                'wrong amount of swapped token on the contract as fees'
            );
            expect(await bridge.availableRubicTokenFee(swapToken.address)).to.be.eq(
                RubicFee,
                'wrong Rubic fees collected'
            );
        });
        it('cross chain with swap amounts with integrator', async () => {
            await bridge.connect(owner).setIntegratorInfo(integratorWallet.address, {
                isIntegrator: true,
                tokenFee: '60000', // 6%
                RubicFixedCryptoShare: '0',
                RubicTokenShare: '400000', // 40%,
                fixedFeeAmount: BN.from(0)
            });

            const { feeAmount, amountWithoutFee, integratorFee, RubicFee } = await calcTokenFees({
                bridge,
                amountWithFee: consts.DEFAULT_AMOUNT_IN,
                integrator: integratorWallet.address
            });

            await callBridge(
                await routerCrossChain.viewEncode(swapToken.address, amountWithoutFee, 228),
                { integrator: integratorWallet.address }
            );

            expect(await swapToken.allowance(bridge.address, routerCrossChain.address)).to.be.eq(0);

            expect(await swapToken.balanceOf(bridge.address)).to.be.eq(
                feeAmount,
                'wrong amount of swapped token on the contract as fees'
            );
            expect(await bridge.availableRubicTokenFee(swapToken.address)).to.be.eq(
                RubicFee,
                'wrong Rubic fees collected'
            );
            expect(
                await bridge.availableIntegratorTokenFee(
                    swapToken.address,
                    integratorWallet.address
                )
            ).to.be.eq(integratorFee, 'wrong integrator fees collected');
        });
        it('cross chain with swap amounts with integrator turned off', async () => {
            await bridge.connect(owner).setIntegratorInfo(integratorWallet.address, {
                isIntegrator: false,
                tokenFee: '60000', // 6%
                RubicFixedCryptoShare: '0',
                RubicTokenShare: '400000', // 40%,
                fixedFeeAmount: BN.from(0)
            });

            const { feeAmount, amountWithoutFee, RubicFee } = await calcTokenFees({
                bridge,
                amountWithFee: consts.DEFAULT_AMOUNT_IN
            });

            await callBridge(
                await routerCrossChain.viewEncode(swapToken.address, amountWithoutFee, 228),
                { integrator: integratorWallet.address }
            );
            expect(await swapToken.allowance(bridge.address, routerCrossChain.address)).to.be.eq(0);

            expect(await swapToken.balanceOf(bridge.address)).to.be.eq(
                feeAmount,
                'wrong amount of swapped token on the contract as fees'
            );
            expect(await bridge.availableRubicTokenFee(swapToken.address)).to.be.eq(
                RubicFee,
                'wrong Rubic fees collected'
            );
        });
        it('check fixed crypto fee without integrator', async () => {
            const { amountWithoutFee } = await calcTokenFees({
                bridge,
                amountWithFee: consts.DEFAULT_AMOUNT_IN
            });

            await callBridge(
                await routerCrossChain.viewEncode(swapToken.address, amountWithoutFee, 228)
            );
            expect(await swapToken.allowance(bridge.address, routerCrossChain.address)).to.be.eq(0);

            expect(await waffle.provider.getBalance(bridge.address)).to.be.eq(
                consts.FIXED_CRYPTO_FEE
            );
            expect(await bridge.availableRubicCryptoFee()).to.be.eq(consts.FIXED_CRYPTO_FEE);
        });
        it('check fixed crypto fee with integrator', async () => {
            await bridge.connect(owner).setIntegratorInfo(integratorWallet.address, {
                isIntegrator: true,
                tokenFee: '60000', // 6%
                RubicFixedCryptoShare: '800000', // 80%
                RubicTokenShare: '400000', // 40%,
                fixedFeeAmount: consts.FIXED_CRYPTO_FEE.add(BN.from('228'))
            });

            const { amountWithoutFee } = await calcTokenFees({
                bridge,
                amountWithFee: consts.DEFAULT_AMOUNT_IN,
                integrator: integratorWallet.address
            });

            const { totalCryptoFee, RubicFixedFee, integratorFixedFee } = await calcCryptoFees({
                bridge,
                integrator: integratorWallet.address
            });

            await callBridge(
                await routerCrossChain.viewEncode(swapToken.address, amountWithoutFee, 228),
                { integrator: integratorWallet.address }
            );

            expect(await waffle.provider.getBalance(bridge.address)).to.be.eq(totalCryptoFee);
            expect(await bridge.availableIntegratorCryptoFee(integratorWallet.address)).to.be.eq(
                integratorFixedFee
            );
            expect(await bridge.availableRubicCryptoFee()).to.be.eq(RubicFixedFee);
            expect(await swapToken.allowance(bridge.address, routerCrossChain.address)).to.be.eq(0);
        });
        it('check fixed crypto fee with integrator (fixedCryptoFee = 0)', async () => {
            await bridge.connect(owner).setIntegratorInfo(integratorWallet.address, {
                isIntegrator: true,
                tokenFee: '60000', // 6%
                RubicFixedCryptoShare: '800000', // 80%
                RubicTokenShare: '400000', // 40%,
                fixedFeeAmount: '0'
            });
            const { amountWithoutFee } = await calcTokenFees({
                bridge,
                amountWithFee: consts.DEFAULT_AMOUNT_IN,
                integrator: integratorWallet.address
            });
            expect(await swapToken.allowance(bridge.address, routerCrossChain.address)).to.be.eq(0);

            await callBridge(
                await routerCrossChain.viewEncode(swapToken.address, amountWithoutFee, 228),
                { integrator: integratorWallet.address }
            );

            expect(await waffle.provider.getBalance(bridge.address)).to.be.eq(0);
            expect(await bridge.availableIntegratorCryptoFee(integratorWallet.address)).to.be.eq(0);
            expect(await bridge.availableRubicCryptoFee()).to.be.eq(0);
        });
    });

    describe('collect functions', () => {
        const tokenFee = BN.from('60000'); // 6%
        const RubicFixedCryptoShare = BN.from('800000'); // 80%
        const RubicTokenShare = BN.from('400000'); // 40%
        const fixedFeeAmount = consts.FIXED_CRYPTO_FEE.add(BN.from('228'));

        let integratorFee;
        let RubicFee;
        let integratorFixedFee;
        let RubicFixedFee;
        let amountWithoutFee;

        beforeEach('setup before collects', async () => {
            await bridge.grantRole(await bridge.MANAGER_ROLE(), manager.address);

            await swapToken.transfer(swapper.address, ethers.utils.parseEther('10'));
            await swapToken.connect(swapper).approve(bridge.address, ethers.constants.MaxUint256);

            await bridge.setIntegratorInfo(integratorWallet.address, {
                isIntegrator: true,
                tokenFee,
                RubicFixedCryptoShare,
                RubicTokenShare,
                fixedFeeAmount
            });

            bridge = bridge.connect(swapper);

            ({ integratorFee, amountWithoutFee, RubicFee } = await calcTokenFees({
                bridge,
                amountWithFee: consts.DEFAULT_AMOUNT_IN,
                integrator: integratorWallet.address
            }));

            ({ integratorFixedFee, RubicFixedFee } = await calcCryptoFees({
                bridge,
                integrator: integratorWallet.address
            }));

            await callBridge(
                await routerCrossChain.viewEncode(swapToken.address, amountWithoutFee, 228),
                { integrator: integratorWallet.address }
            );

            bridge = bridge.connect(manager);
        });

        it('collect integrator token fee by integrator', async () => {
            await bridge
                .connect(integratorWallet)
                ['collectIntegratorFee(address)'](swapToken.address);

            expect(await swapToken.balanceOf(integratorWallet.address)).to.be.eq(integratorFee);
        });
        it('collect integrator token fee by manager', async () => {
            await bridge['collectIntegratorFee(address,address)'](
                integratorWallet.address,
                swapToken.address
            );

            expect(await swapToken.balanceOf(integratorWallet.address)).to.be.eq(integratorFee);
        });
        it('collect Rubic Token fee', async () => {
            await bridge.collectRubicFee(swapToken.address);

            expect(await swapToken.balanceOf(manager.address)).to.be.eq(RubicFee);
        });
    });
});
