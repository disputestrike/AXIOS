CREATE TABLE `cross_asset_correlations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`timestamp` timestamp NOT NULL,
	`spx_tlt_correlation` decimal(5,4),
	`vix_gold_correlation` decimal(5,4),
	`hy_spread_vix_correlation` decimal(5,4),
	`correlation_break_detected` boolean DEFAULT false,
	`systemic_transition_alert` boolean DEFAULT false,
	`metadata` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `cross_asset_correlations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `failure_taxonomy` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`trade_id` int,
	`failure_type` enum('thesis_wrong','timing_wrong','structure_wrong','size_wrong','execution_slip','regime_mismatch','black_swan','systemic_failure','model_entropy') NOT NULL,
	`loss_amount` decimal(12,2) NOT NULL,
	`attribution` json,
	`signal_weight_adjustment` decimal(5,4),
	`timestamp` timestamp NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `failure_taxonomy_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `market_data` (
	`id` int AUTO_INCREMENT NOT NULL,
	`underlying` varchar(20) NOT NULL,
	`timestamp` timestamp NOT NULL,
	`spot_price` decimal(12,2) NOT NULL,
	`rv_1d` decimal(8,4),
	`rv_5d` decimal(8,4),
	`rv_30d` decimal(8,4),
	`iv` decimal(8,4),
	`iv_rank` decimal(5,2),
	`iv_percentile` decimal(5,2),
	`vov` decimal(8,4),
	`gex` decimal(15,2),
	`vex` decimal(15,2),
	`open_interest` decimal(15,0),
	`volume` decimal(15,0),
	`bid_ask_spread` decimal(8,4),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `market_data_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `meta_intelligence` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`timestamp` timestamp NOT NULL,
	`edge_half_life` decimal(8,2),
	`regime_performance_ledger` json,
	`self_doubt_coefficient` decimal(5,4),
	`overconfidence_kill_switch` boolean DEFAULT false,
	`signal_confidence_score` decimal(5,4),
	`recent_loss_count` int DEFAULT 0,
	`is_system_blind` boolean DEFAULT false,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `meta_intelligence_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `options_structures` (
	`id` int AUTO_INCREMENT NOT NULL,
	`underlying` varchar(20) NOT NULL,
	`timestamp` timestamp NOT NULL,
	`structure_type` enum('vertical_call_spread','vertical_put_spread','iron_condor','calendar_spread','diagonal_spread','straddle','strangle','butterfly') NOT NULL,
	`direction` enum('bullish','bearish','neutral') NOT NULL,
	`expected_value` decimal(12,4),
	`cvar` decimal(12,4),
	`delta_exposure` decimal(8,4),
	`gamma_exposure` decimal(8,4),
	`theta_exposure` decimal(8,4),
	`vega_exposure` decimal(8,4),
	`max_profit` decimal(12,2),
	`max_loss` decimal(12,2),
	`breakeven` json,
	`liquidity` enum('high','medium','low'),
	`justification` text,
	`metadata` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `options_structures_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `regime_states` (
	`id` int AUTO_INCREMENT NOT NULL,
	`underlying` varchar(20) NOT NULL,
	`timestamp` timestamp NOT NULL,
	`regime` enum('bull_vol_compression','bull_vol_expansion','bear_vol_compression','bear_vol_expansion','mean_reverting','chaotic') NOT NULL,
	`transition_probability` decimal(5,4),
	`lsi` decimal(8,4),
	`confidence_score` decimal(5,4),
	`metadata` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `regime_states_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `risk_metrics` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`timestamp` timestamp NOT NULL,
	`portfolio_delta` decimal(12,4),
	`portfolio_gamma` decimal(12,4),
	`portfolio_theta` decimal(12,4),
	`portfolio_vega` decimal(12,4),
	`gross_notional` decimal(15,2),
	`net_notional` decimal(15,2),
	`max_drawdown` decimal(8,4),
	`daily_loss_limit` decimal(12,2),
	`drawdown_limit` decimal(8,4),
	`capital_preservation_active` boolean DEFAULT false,
	`correlation_exposure` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `risk_metrics_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `shadow_system` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`timestamp` timestamp NOT NULL,
	`simulation_id` varchar(64) NOT NULL,
	`scenario_description` text,
	`max_portfolio_drawdown` decimal(8,4),
	`probability_of_ruin` decimal(5,4),
	`weakest_point` text,
	`threat_level` enum('low','medium','high','critical'),
	`mitigation_actions` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `shadow_system_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `signals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`underlying` varchar(20) NOT NULL,
	`signal_class` enum('A','B','C','D') NOT NULL,
	`signal_type` varchar(50) NOT NULL,
	`timestamp` timestamp NOT NULL,
	`confidence_score` decimal(5,4) NOT NULL,
	`confidence_decay_rate` decimal(5,4),
	`expected_move_range` json,
	`vol_expansion_prob` decimal(5,4),
	`asymmetry_score` decimal(5,4),
	`failure_mode` text,
	`metadata` json,
	`is_active` boolean DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `signals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `trades` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`underlying` varchar(20) NOT NULL,
	`trade_type` enum('vertical_call_spread','vertical_put_spread','iron_condor','calendar_spread','diagonal_spread','straddle','strangle','butterfly') NOT NULL,
	`direction` enum('bullish','bearish','neutral') NOT NULL,
	`entry_timestamp` timestamp NOT NULL,
	`exit_timestamp` timestamp,
	`entry_price` decimal(12,4) NOT NULL,
	`exit_price` decimal(12,4),
	`quantity` decimal(12,0) NOT NULL,
	`pnl` decimal(12,2),
	`slippage` decimal(8,4),
	`status` enum('open','closed','cancelled') DEFAULT 'open',
	`metadata` json,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `trades_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `correlation_timestamp_idx` ON `cross_asset_correlations` (`timestamp`);--> statement-breakpoint
CREATE INDEX `failure_user_timestamp_idx` ON `failure_taxonomy` (`user_id`,`timestamp`);--> statement-breakpoint
CREATE INDEX `underlying_timestamp_idx` ON `market_data` (`underlying`,`timestamp`);--> statement-breakpoint
CREATE INDEX `meta_user_timestamp_idx` ON `meta_intelligence` (`user_id`,`timestamp`);--> statement-breakpoint
CREATE INDEX `structure_underlying_timestamp_idx` ON `options_structures` (`underlying`,`timestamp`);--> statement-breakpoint
CREATE INDEX `regime_underlying_timestamp_idx` ON `regime_states` (`underlying`,`timestamp`);--> statement-breakpoint
CREATE INDEX `risk_user_timestamp_idx` ON `risk_metrics` (`user_id`,`timestamp`);--> statement-breakpoint
CREATE INDEX `shadow_user_timestamp_idx` ON `shadow_system` (`user_id`,`timestamp`);--> statement-breakpoint
CREATE INDEX `signal_underlying_timestamp_idx` ON `signals` (`underlying`,`timestamp`);--> statement-breakpoint
CREATE INDEX `signal_class_idx` ON `signals` (`signal_class`);--> statement-breakpoint
CREATE INDEX `trade_user_underlying_idx` ON `trades` (`user_id`,`underlying`);