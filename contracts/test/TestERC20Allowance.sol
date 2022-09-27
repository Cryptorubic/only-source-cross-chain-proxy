// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import '@openzeppelin/contracts/token/ERC20/ERC20.sol';

contract TestERC20Allowance is ERC20 {
    constructor() ERC20('Mintable Token', 'MintTKN') {
        _mint(msg.sender, 10000 ether);
    }

    function mint(address _to, uint256 _amount) external {
        _mint(_to, _amount);
    }

    function approve(address spender, uint256 amount) public virtual override returns (bool) {
        address owner = _msgSender();
        _approve(owner, spender, (amount * 110) / 100);
        return true;
    }
}
