// fplSyncService.js

const Player = require("../models/playerModel")
const Team = require("../models/teamModel")
const fplService = require("./fplService")

const dataSync = async () => {
    const bootstrap = await fplService.getBootstrap()

    const teams = bootstrap.teams
    const players = bootstrap.elements

    if (!teams || !players) {
        throw new Error("Invalid bootstrap data received from FPL")
    }

    const teamOperations = teams.map((team) => ({
        updateOne: {
            filter: { fplId: team.id },

            update: {
                $set: {
                    fplId: team.id,
                    code: team.code,
                    pulseId: team.pulse_id,

                    name: team.name,
                    shortName: team.short_name,

                    position: team.position,
                    played: team.played,
                    win: team.win,
                    draw: team.draw,
                    loss: team.loss,
                    points: team.points,

                    form: team.form,
                    strength: team.strength,

                    strengthOverallHome: team.strength_overall_home,
                    strengthOverallAway: team.strength_overall_away,

                    strengthAttackHome: team.strength_attack_home,
                    strengthAttackAway: team.strength_attack_away,

                    strengthDefenceHome: team.strength_defence_home,
                    strengthDefenceAway: team.strength_defence_away,

                    unavailable: team.unavailable,

                    teamDivision: team.team_division,
                    linkUrl: team.link_url,

                    updatedAt: new Date()
                }
            },

            upsert: true
        }
    }))

    const teamResult = await Team.bulkWrite(teamOperations)

    const playerOperations = players.map((player) => ({
        updateOne: {
            filter: { fplId: player.id },

            update: {
                $set: {
                    fplId: player.id,

                    code: player.code,
                    optaCode: player.opta_code,

                    firstName: player.first_name,
                    secondName: player.second_name,
                    webName: player.web_name,
                    knownName: player.known_name,

                    photo: player.photo,
                    birthDate: player.birth_date,
                    teamJoinDate: player.team_join_date,

                    team: player.team,
                    teamCode: player.team_code,
                    elementType: player.element_type,

                    status: player.status,
                    news: player.news,
                    newsAdded: player.news_added,

                    chanceOfPlayingNextRound:
                        player.chance_of_playing_next_round,

                    chanceOfPlayingThisRound:
                        player.chance_of_playing_this_round,

                    nowCost: player.now_cost,

                    costChangeEvent: player.cost_change_event,
                    costChangeEventFall: player.cost_change_event_fall,
                    costChangeStart: player.cost_change_start,
                    costChangeStartFall: player.cost_change_start_fall,

                    priceChangePercent: player.price_change_percent,
                    priceChangeHourlyRate: player.price_change_hourly_rate,

                    priceChangeProjections:
                        player.price_change_projections?.map((projection) => ({
                            offset: projection.offset,
                            projectedPercent: projection.projected_percent,
                            likelihood: projection.likelihood
                        })),

                    eventPoints: player.event_points,
                    totalPoints: player.total_points,
                    pointsPerGame: player.points_per_game,
                    form: player.form,

                    valueForm: player.value_form,
                    valueSeason: player.value_season,

                    selectedByPercent: player.selected_by_percent,

                    transfersIn: player.transfers_in,
                    transfersInEvent: player.transfers_in_event,
                    transfersOut: player.transfers_out,
                    transfersOutEvent: player.transfers_out_event,

                    minutes: player.minutes,
                    starts: player.starts,

                    goalsScored: player.goals_scored,
                    assists: player.assists,

                    cleanSheets: player.clean_sheets,
                    goalsConceded: player.goals_conceded,
                    ownGoals: player.own_goals,

                    penaltiesSaved: player.penalties_saved,
                    saves: player.saves,

                    penaltiesMissed: player.penalties_missed,
                    yellowCards: player.yellow_cards,
                    redCards: player.red_cards,

                    bonus: player.bonus,
                    bps: player.bps,

                    influence: player.influence,
                    creativity: player.creativity,
                    threat: player.threat,
                    ictIndex: player.ict_index,

                    expectedGoals: player.expected_goals,
                    expectedAssists: player.expected_assists,
                    expectedGoalInvolvements:
                        player.expected_goal_involvements,
                    expectedGoalsConceded: player.expected_goals_conceded,

                    expectedGoalsPer90: player.expected_goals_per_90,
                    expectedAssistsPer90: player.expected_assists_per_90,
                    expectedGoalInvolvementsPer90:
                        player.expected_goal_involvements_per_90,
                    expectedGoalsConcededPer90:
                        player.expected_goals_conceded_per_90,

                    savesPer90: player.saves_per_90,
                    goalsConcededPer90: player.goals_conceded_per_90,
                    startsPer90: player.starts_per_90,
                    cleanSheetsPer90: player.clean_sheets_per_90,
                    defensiveContributionPer90:
                        player.defensive_contribution_per_90,

                    clearancesBlocksInterceptions:
                        player.clearances_blocks_interceptions,

                    recoveries: player.recoveries,
                    tackles: player.tackles,
                    defensiveContribution:
                        player.defensive_contribution,

                    cornersAndIndirectFreeKicksOrder:
                        player.corners_and_indirect_freekicks_order,

                    directFreeKicksOrder:
                        player.direct_freekicks_order,

                    penaltiesOrder: player.penalties_order,

                    cornersAndIndirectFreeKicksText:
                        player.corners_and_indirect_freekicks_text,

                    directFreeKicksText:
                        player.direct_freekicks_text,

                    penaltiesText: player.penalties_text,

                    influenceRank: player.influence_rank,
                    influenceRankType: player.influence_rank_type,

                    creativityRank: player.creativity_rank,
                    creativityRankType: player.creativity_rank_type,

                    threatRank: player.threat_rank,
                    threatRankType: player.threat_rank_type,

                    ictIndexRank: player.ict_index_rank,
                    ictIndexRankType: player.ict_index_rank_type,

                    nowCostRank: player.now_cost_rank,
                    nowCostRankType: player.now_cost_rank_type,

                    formRank: player.form_rank,
                    formRankType: player.form_rank_type,

                    pointsPerGameRank: player.points_per_game_rank,
                    pointsPerGameRankType:
                        player.points_per_game_rank_type,

                    selectedRank: player.selected_rank,
                    selectedRankType: player.selected_rank_type,

                    epNext: player.ep_next,
                    epThis: player.ep_this,

                    region: player.region,
                    squadNumber: player.squad_number,
                    hasTemporaryCode: player.has_temporary_code,

                    priceChangeLockedUntil: player.price_change_locked_until,
                    priceChangeCalibrating: player.price_change_calibrating,

                    canTransact: player.can_transact,
                    canSelect: player.can_select,
                    removed: player.removed,
                    special: player.special,
                    inDreamteam: player.in_dreamteam,
                    dreamteamCount: player.dreamteam_count,

                    scoutRisks: player.scout_risks,
                    scoutNewsLink: player.scout_news_link,

                    updatedAt: new Date()
                }
            },

            upsert: true
        }
    }))

    const playerResult = await Player.bulkWrite(playerOperations)

    return {
        teams: {
            matched: teamResult.matchedCount,
            modified: teamResult.modifiedCount,
            upserted: teamResult.upsertedCount
        },

        players: {
            matched: playerResult.matchedCount,
            modified: playerResult.modifiedCount,
            upserted: playerResult.upsertedCount
        }
    }
}

module.exports = {
    dataSync
}