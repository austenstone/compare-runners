import { getInput, startGroup, endGroup } from "@actions/core";
import { getOctokit } from "@actions/github";
import { components } from "@octokit/openapi-types";

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
  const octokit = getOctokit(input.token);
  const ownerRepo = {
    owner: input.owner,
    repo: input.repo,
  };

  const repoWorkflowsRsp = await octokit.rest.actions.listRepoWorkflows(ownerRepo);
  const workflows = repoWorkflowsRsp.data.workflows;

  let workflowRuns: components["schemas"]["workflow-run"][] = [];
  if (input.workflow) {
    const workflow = workflows.find((w) => w.name === input.workflow);
    if (!workflow) throw new Error(`Workflow ${input.workflow} not found`);

    const workflowRunsRsp = await octokit.rest.actions.listWorkflowRuns({
      ...ownerRepo,
      workflow_id: workflow.id,
    });
    workflowRuns = workflowRunsRsp.data.workflow_runs;
  } else {
    const repoWorkflowRunsRsp = await octokit.rest.actions.listWorkflowRunsForRepo(ownerRepo);
    workflowRuns = repoWorkflowRunsRsp.data.workflow_runs;
  }
  
  startGroup("Workflow runs");
  console.log(workflowRuns);
  endGroup();

  for (const workflowRun of workflowRuns) {
    const jobsRsp = await octokit.rest.actions.listJobsForWorkflowRun({
      ...ownerRepo,
      run_id: workflowRun.id,
    });
    const jobs = jobsRsp.data.jobs;
    startGroup(`Workflow run ${workflowRun.id}`);
    console.log(jobs);
    endGroup();
  }
};

run();
