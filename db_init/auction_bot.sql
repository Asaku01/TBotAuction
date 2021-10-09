-- phpMyAdmin SQL Dump
-- version 5.1.1
-- https://www.phpmyadmin.net/
--
-- Host: db
-- Generation Time: Sep 09, 2021 at 03:20 PM
-- Server version: 8.0.26
-- PHP Version: 7.4.20

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `auction_bot`
--
CREATE DATABASE IF NOT EXISTS `auction_bot` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE `auction_bot`;

-- --------------------------------------------------------

--
-- Table structure for table `Auctions`
--

CREATE TABLE `Auctions` (
  `channel_id` varchar(200) NOT NULL,
  `channel_sequence` int NOT NULL,
  `title` varchar(200) NOT NULL,
  `description` varchar(2000) NOT NULL,
  `start_date` timestamp NOT NULL,
  `end_date` timestamp NOT NULL,
  `start_price` int NOT NULL,
  `min_biders` int NOT NULL,
  `min_bid` int NOT NULL,
  `cover_image_id` varchar(2000) NOT NULL,
  `other_images_id` varchar(2000) NOT NULL,
  `created_by_user` varchar(200) NOT NULL,
  `created_by_user_id` int NOT NULL,
  `created_at` timestamp NOT NULL,
  `status` varchar(200) NOT NULL,
  `last_notification` timestamp NOT NULL,
  `channel_message_id` varchar(200) NOT NULL,
  `thread_channel_id` varchar(200) NOT NULL,
  `thread_message_id` varchar(200) NOT NULL,
  `currency` varchar(20) NOT NULL,
  `currency_country_code` varchar(20) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `Channels`
--

CREATE TABLE `Channels` (
  `channel_id` varchar(200) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `channel_id_sequence` int NOT NULL,
  `chat_title` varchar(100) NOT NULL,
  `chat_username` varchar(100) NOT NULL,
  `chat_type` varchar(100) NOT NULL,
  `chat_status` varchar(100) NOT NULL,
  `added_by` varchar(100) NOT NULL,
  `added_by_id` int NOT NULL,
  `insert_date` timestamp NOT NULL,
  `update_date` timestamp NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `NotifyList`
--

CREATE TABLE `NotifyList` (
  `id` int NOT NULL,
  `auction_sequence` int NOT NULL,
  `user_name` varchar(200) NOT NULL,
  `user_id` int NOT NULL,
  `first_name` varchar(200) NOT NULL,
  `private_chat_id` varchar(200) NOT NULL,
  `date_added` timestamp NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- --------------------------------------------------------

--
-- Table structure for table `Offers`
--

CREATE TABLE `Offers` (
  `channel_id` varchar(200) NOT NULL,
  `channel_sequence` int NOT NULL,
  `bid_sequence` int NOT NULL,
  `user_id` int NOT NULL,
  `user_name` varchar(100) NOT NULL,
  `first_name` varchar(200) NOT NULL,
  `offer` int NOT NULL,
  `date` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

--
-- Indexes for dumped tables
--

--
-- Indexes for table `Auctions`
--
ALTER TABLE `Auctions`
  ADD PRIMARY KEY (`channel_id`,`channel_sequence`),
  ADD KEY `channel_sequence` (`channel_sequence`);

--
-- Indexes for table `Channels`
--
ALTER TABLE `Channels`
  ADD PRIMARY KEY (`channel_id`),
  ADD UNIQUE KEY `Key` (`channel_id_sequence`);

--
-- Indexes for table `NotifyList`
--
ALTER TABLE `NotifyList`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `Offers`
--
ALTER TABLE `Offers`
  ADD PRIMARY KEY (`channel_id`,`channel_sequence`,`bid_sequence`),
  ADD KEY `bid_id` (`bid_sequence`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `Auctions`
--
ALTER TABLE `Auctions`
  MODIFY `channel_sequence` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `Channels`
--
ALTER TABLE `Channels`
  MODIFY `channel_id_sequence` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `NotifyList`
--
ALTER TABLE `NotifyList`
  MODIFY `id` int NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `Offers`
--
ALTER TABLE `Offers`
  MODIFY `bid_sequence` int NOT NULL AUTO_INCREMENT;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `Offers`
--
ALTER TABLE `Offers`
  ADD CONSTRAINT `Offers_ibfk_1` FOREIGN KEY (`channel_id`,`channel_sequence`) REFERENCES `Auctions` (`channel_id`, `channel_sequence`) ON DELETE CASCADE ON UPDATE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;

CREATE USER 'auction_user'@'%' IDENTIFIED BY 'auction_bot';

GRANT ALL PRIVILEGES ON auction_bot.* TO 'auction_user'@'%' WITH GRANT OPTION;

FLUSH PRIVILEGES;
COMMIT;