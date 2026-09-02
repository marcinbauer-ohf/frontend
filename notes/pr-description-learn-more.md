## Proposed change

Moves the trigger/condition/action description from the top of the configuration panel to the bottom, behind a divider and in secondary text color, and replaces the question-mark icon that linked to the documentation with an inline "Learn more" link.

The description is read once when you pick a trigger and never again, but it sat above every input field, pushing the fields you came to edit below the fold in the narrow sidebar on every visit. At the bottom it stays available without costing that space on every visit. The documentation link was an unlabelled icon parked at the right edge, away from the prose it belonged to and looking like a control in a panel full of real controls; as a text link it says what it is, is a larger target, and can't be mistaken for something that changes the config. Removing the icon is also most of the space saving, since it forced a fixed row height even for a one-line description.

Note for reviewers: `ha-service-control` is shared, so the action change is also visible in the script editor, more-info action controls, and the developer tools action panel.

## Screenshots

<!-- TODO: before/after for a trigger, a condition, and an action. -->

## Type of change

<!--
  What type of change does your PR introduce to the Home Assistant frontend?
  NOTE: Please, check only 1! box!
  If your PR requires multiple boxes to be checked, you'll most likely need to
  split it into multiple PRs. This makes things easier and faster to code review.
-->

- [ ] Dependency upgrade
- [ ] Bugfix (non-breaking change which fixes an issue)
- [x] New feature (thank you!)
- [ ] Breaking change (fix/feature causing existing functionality to break)
- [ ] Code quality improvements to existing code or addition of tests

## Additional information

<!--
  Details are important, and help maintainers processing your PR.
  Please be sure to fill out additional details, if applicable.
-->

- This PR fixes or closes issue: fixes #
- This PR is related to issue or discussion:
- Link to documentation pull request:
- Link to developer documentation pull request:
- Link to backend pull request:

## Checklist

<!--
  Put an `x` in the boxes that apply. You can also fill these out after
  creating the PR. If you're unsure about any of them, don't hesitate to ask.
  We're here to help! This is simply a reminder of what we are going to look
  for before merging your code.

  AI tools are welcome, but contributors are responsible for *fully*
  understanding the code before submitting a PR.
-->

- [ ] I understand the code I am submitting and can explain how it works.
- [ ] The code change is tested and works locally.
- [ ] There is no commented out code in this PR.
- [ ] I have followed the [perfect PR recommendations][perfect-pr]
- [ ] Any generated code has been carefully reviewed for correctness and compliance with project standards.

If user exposed functionality or configuration variables are added/changed:

- [ ] Documentation added/updated for [www.home-assistant.io][docs-repository]

To help with the load of incoming pull requests:

- [ ] I have reviewed two other [open pull requests][prs] in this repository.

[prs]: https://github.com/home-assistant/frontend/pulls?q=is%3Aopen+is%3Apr+-author%3A%40me+-draft%3Atrue+sort%3Acreated-desc+review%3Anone+-status%3Afailure
[docs-repository]: https://github.com/home-assistant/home-assistant.io
[perfect-pr]: https://developers.home-assistant.io/docs/review-process/#creating-the-perfect-pr
