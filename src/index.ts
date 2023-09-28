import { getInput, startGroup, endGroup, summary } from "@actions/core";
import { SummaryTableRow } from "@actions/core/lib/summary";
import { getOctokit } from "@actions/github";
import { components } from "@octokit/openapi-types";
import { writeFileSync } from "fs";
import dayjs from 'dayjs';
import duration from 'dayjs/plugin/duration';
dayjs.extend(duration)
// import relativeTime from 'dayjs/plugin/relativeTime';
// dayjs.extend(relativeTime)

interface Input {
  token: string;
  owner: string;
  repo: string;
  workflow: string;
}

export function getInputs(): Input {
  const result = {} as Input;
  result.token = getInput("github-token");
  result.owner = getInput("owner");
  result.repo = getInput("repo");
  result.workflow = getInput("workflow");
  return result;
}

const run = async (): Promise<void> => {
  const input = getInputs();
  const octokit = getOctokit(input.token, {
    throttle: {
      onRateLimit: (retryAfter, options, octokit, retryCount) => {
        octokit.log.warn(`Request quota exhausted for request ${options.method} ${options.url}`,);

        if (retryCount < 1) {
          octokit.log.info(`Retrying after ${retryAfter} seconds!`);
          return true;
        }
        return false;
      },
      onSecondaryRateLimit: (_, options, octokit) => {
        octokit.log.warn(
          `SecondaryRateLimit detected for request ${options.method} ${options.url}`,
        );
      },
    },
  });

  const workflows: components["schemas"]['workflow'][] = await octokit.paginate({
    method: "GET",
    url: `/repos/${input.owner}/${input.repo}/actions/workflows`,
  });

  let workflowRuns: components["schemas"]["workflow-run"][] = [];
  if (input.workflow) {
    const workflow = workflows.find((w) => w.name === input.workflow);
    if (!workflow) throw new Error(`Workflow ${input.workflow} not found`);

    workflowRuns = await octokit.paginate({
      method: "GET",
      url: `/repos/${input.owner}/${input.repo}/actions/workflows/${workflow.id}/runs`,
    });
  } else {
    workflowRuns = await octokit.paginate({
      method: "GET",
      url: `/repos/${input.owner}/${input.repo}/actions/runs`
    })
  }

  startGroup("Workflow runs");
  console.log(workflowRuns);
  writeFileSync("workflow-runs.json", JSON.stringify(workflowRuns, null, 2));
  endGroup();

  // TEMP truncate the workflowRuns array to only have 3 elements
  workflowRuns = workflowRuns.slice(0, 3);
  // END


  let jobs: components["schemas"]['job'][] = [];
  for (const workflowRun of workflowRuns) {
    jobs = await octokit.paginate({
      method: "GET",
      url: workflowRun.jobs_url,
    });
    startGroup(`Workflow run ${workflowRun.id}`);
    console.log(jobs);
    writeFileSync(`workflow-run-${workflowRun.id}.json`, JSON.stringify(jobs, null, 2));
    endGroup();
  }

  const tableData: SummaryTableRow[] = workflowRuns?.map((workflowRun) => {
    return [
      workflowRun.name || workflowRun.id.toString(),
      dayjs.duration((new Date(workflowRun.updated_at)).getTime() - (new Date(workflowRun.created_at)).getTime()).asMinutes().toString(),
    ];
  });

  const table = [
    [{ data: 'Workflow', header: true }, { data: 'Duration', header: true }],
    ...tableData
  ];

  console.log(table);

  return;

  await summary
    .addHeading('Workflow')
    .addTable(table)
    .write()
};

run();
