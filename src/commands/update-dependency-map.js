import { parsePackage } from './utility/swift';
import { createConfig, getAllConfigs, publishNewConfig } from './utility/config';

const build = {};
if (process.env.TRAVIS_REPO_SLUG) {
	build.travis = process.env.TRAVIS_REPO_SLUG;
}

function updateConfig({ pkg, config }) {
	return config.getContent()
		.then(content => {
			console.log(`Processing config update for ${content.name}`);
			const needsReference = pkg.dependencies.find(x => x.name === content.name);
			const hasReference = content.downstream.find(x => x.name === pkg.name);
			if (needsReference && !hasReference) {
				console.log('  ... Adding reference');
				const updatedContent = {
					...content,
					downstream: [
						...content.downstream,
						{ name: pkg.name, build },
					],
				};
				return config.updateContent(updatedContent, `[SWIFTX-BOT] Adding ${pkg.name} as a dependency to ${content.name}`);
			} else if (!needsReference && hasReference) {
				console.log('  ... Removing reference');
				const updatedContent = {
					...content,
					downstream: content.downstream.filter(x => x.name !== pkg.name),
				};
				return config.updateContent(updatedContent, `[SWIFTX-BOT] Removing ${pkg.name} as a dependency from ${content.name}`);
			}
			console.log('  ... Everything up to date');
			return Promise.resolve();
		});
}

function getOrCreateDependentConfigs({ pkg, owner, configPath }) {
	return getAllConfigs({ owner, configPath })
		.then(existingConfigs => {
			const missingConfigs = pkg.dependencies
				.filter(x => !existingConfigs.find(({ meta }) =>
					meta.path.toLowerCase().endsWith(`${x.name}.json`.toLowerCase())));

			const publishMissingConfigs = missingConfigs.reduce((acc, x) => acc.then(() =>
				publishNewConfig({
					owner,
					configPath,
					content: createConfig({
						owner,
						name: x.name,
						upstream: [],
						downstream: [{ name: pkg.name, build }],
					}),
				})), Promise.resolve());

			return publishMissingConfigs;
		})
		.then(() => getAllConfigs({
			owner,
			configPath,
			predicate: (x) => pkg.dependencies.find(dependency =>
				x.path.toLowerCase().endsWith(`${dependency.name}.json`.toLowerCase())),
		}));
}

export default function updateDependencyMap({ owner, configPath }) {
	return parsePackage(owner)
		.then(pkg => getOrCreateDependentConfigs({ pkg, owner, configPath })
			.then(configs => ({ configs, pkg })))
		.then(({ configs, pkg }) =>
			configs.reduce((acc, v) => acc.then(() => updateConfig({ pkg, v }), Promise.resolve())))
		.then(() => ({
			code: 0,
		}));
}
