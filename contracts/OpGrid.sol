// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

contract OpGrid is Ownable, ReentrancyGuard, Pausable {

    enum MissionStatus { Open, Active, Submitted, Completed, Rejected, Cancelled }

    struct Mission {
        uint256 id;
        string title;
        string description;
        address poster;
        address operator;
        uint256 reward;
        MissionStatus status;
        string proof;
        uint256 createdAt;
        uint256 completedAt;
    }

    uint256 public platformFee; // in basis points (e.g., 300 = 3%)
    uint256 public accumulatedFees;
    uint256 public missionCount;

    mapping(uint256 => Mission) public missions;

    event MissionCreated(uint256 indexed id, address indexed poster, string title, uint256 reward);
    event MissionAccepted(uint256 indexed id, address indexed operator);
    event ProofSubmitted(uint256 indexed id, address indexed operator, string proof);
    event MissionCompleted(uint256 indexed id, address indexed operator, uint256 reward);
    event MissionRejected(uint256 indexed id);
    event MissionCancelled(uint256 indexed id);

    constructor(uint256 _platformFee) Ownable(msg.sender) {
        require(_platformFee <= 1000, "Fee too high"); // max 10%
        platformFee = _platformFee;
    }

    function createMission(string calldata _title, string calldata _description) external payable whenNotPaused {
        require(msg.value > 0, "Reward required");
        require(bytes(_title).length > 0, "Title required");

        uint256 missionId = missionCount;
        missionCount++;

        missions[missionId] = Mission({
            id: missionId,
            title: _title,
            description: _description,
            poster: msg.sender,
            operator: address(0),
            reward: msg.value,
            status: MissionStatus.Open,
            proof: "",
            createdAt: block.timestamp,
            completedAt: 0
        });

        emit MissionCreated(missionId, msg.sender, _title, msg.value);
    }

    function acceptMission(uint256 _missionId) external whenNotPaused {
        Mission storage mission = missions[_missionId];
        require(mission.poster != address(0), "Mission does not exist");
        require(mission.status == MissionStatus.Open, "Mission not open");
        require(msg.sender != mission.poster, "Poster cannot accept own mission");

        mission.operator = msg.sender;
        mission.status = MissionStatus.Active;

        emit MissionAccepted(_missionId, msg.sender);
    }

    function submitProof(uint256 _missionId, string calldata _proof) external whenNotPaused {
        Mission storage mission = missions[_missionId];
        require(mission.status == MissionStatus.Active, "Mission not active");
        require(msg.sender == mission.operator, "Only operator can submit proof");
        require(bytes(_proof).length > 0, "Proof required");

        mission.proof = _proof;
        mission.status = MissionStatus.Submitted;

        emit ProofSubmitted(_missionId, msg.sender, _proof);
    }

    function approveMission(uint256 _missionId) external nonReentrant whenNotPaused {
        Mission storage mission = missions[_missionId];
        require(mission.status == MissionStatus.Submitted, "Mission not submitted");
        require(msg.sender == mission.poster, "Only poster can approve");

        mission.status = MissionStatus.Completed;
        mission.completedAt = block.timestamp;

        uint256 fee = (mission.reward * platformFee) / 10000;
        uint256 payout = mission.reward - fee;
        accumulatedFees += fee;

        (bool success, ) = payable(mission.operator).call{value: payout}("");
        require(success, "Transfer failed");

        emit MissionCompleted(_missionId, mission.operator, payout);
    }

    function rejectMission(uint256 _missionId) external whenNotPaused {
        Mission storage mission = missions[_missionId];
        require(mission.status == MissionStatus.Submitted, "Mission not submitted");
        require(msg.sender == mission.poster, "Only poster can reject");

        mission.status = MissionStatus.Active;
        mission.proof = "";

        emit MissionRejected(_missionId);
    }

    function cancelMission(uint256 _missionId) external nonReentrant whenNotPaused {
        Mission storage mission = missions[_missionId];
        require(mission.status == MissionStatus.Open, "Can only cancel open missions");
        require(msg.sender == mission.poster, "Only poster can cancel");

        mission.status = MissionStatus.Cancelled;

        (bool success, ) = payable(mission.poster).call{value: mission.reward}("");
        require(success, "Refund failed");

        emit MissionCancelled(_missionId);
    }

    function getMission(uint256 _missionId) external view returns (Mission memory) {
        require(_missionId < missionCount, "Mission does not exist");
        return missions[_missionId];
    }

    function getMissionCount() external view returns (uint256) {
        return missionCount;
    }

    function getActiveMissions() external view returns (uint256) {
        uint256 active = 0;
        for (uint256 i = 0; i < missionCount; i++) {
            if (missions[i].status == MissionStatus.Open || missions[i].status == MissionStatus.Active) {
                active++;
            }
        }
        return active;
    }

    function withdrawFees() external onlyOwner nonReentrant {
        uint256 amount = accumulatedFees;
        require(amount > 0, "No fees to withdraw");
        accumulatedFees = 0;

        (bool success, ) = payable(owner()).call{value: amount}("");
        require(success, "Withdrawal failed");
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
